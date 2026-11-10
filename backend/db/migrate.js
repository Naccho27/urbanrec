'use strict'

// ─────────────────────────────────────────────────────────
// EJECUTOR DE MIGRACIONES
//
// Corre en orden los archivos de db/migrations/ que todavía no se
// aplicaron y registra cada uno en la tabla schema_migrations. Así una
// base nueva (otra PC, el servidor de producción, un compañero) se arma
// con un solo comando, en el orden correcto y sin saltear ninguno.
//
// Uso (desde la carpeta backend):
//   node db/migrate.js                        aplica las pendientes
//   node db/migrate.js --status               muestra cuáles están aplicadas
//   node db/migrate.js --baseline --until=016 marca como aplicadas hasta la 016
//                                             SIN ejecutarlas (para una base que
//                                             ya se armó a mano, como la de desarrollo)
//
// El orden es alfabético por nombre de archivo: 001_ va antes que 001b_,
// y 009_ antes que 010_. Por eso los números llevan ceros adelante.
// ─────────────────────────────────────────────────────────

const fs     = require('fs')
const path   = require('path')
const crypto = require('crypto')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const mysql  = require('mysql2/promise')

const MIGRATIONS_DIR = path.join(__dirname, 'migrations')
const DB_NAME = process.env.DB_NAME

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const option = (name) => {
  const found = args.find(a => a.startsWith(`--${name}=`))
  return found ? found.split('=')[1] : null
}

// Huella del contenido: si alguien edita una migración ya aplicada,
// se avisa (lo correcto es crear una migración nueva, no editar la vieja)
const checksum = (content) => crypto.createHash('sha256').update(content).digest('hex')

// Las migraciones empiezan con "USE residuos_urbanos;". Se quita porque
// la conexión ya apunta a DB_NAME: si la base tuviera otro nombre (por
// ejemplo, una base de pruebas), el USE la cambiaría sin avisar.
const stripUse = (sql) => sql.replace(/^\s*USE\s+`?\w+`?\s*;\s*$/gim, '')

const listFiles = () => fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort()

// "016_add_alert_settings.sql" → "016"; "001b_create_users.sql" → "001b"
const prefixOf = (file) => file.split('_')[0]

const main = async () => {
  if (!DB_NAME) throw new Error('Falta DB_NAME en backend/.env')

  // multipleStatements: cada archivo .sql tiene varias sentencias.
  // Solo se habilita en este script, nunca en el pool de la API, porque
  // ahí facilitaría inyecciones SQL.
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT || '3306', 10),
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true
  })

  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    )
    await conn.query(`USE \`${DB_NAME}\``)
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name       VARCHAR(255) PRIMARY KEY  COMMENT 'Nombre del archivo de migración',
         checksum   CHAR(64)     NOT NULL     COMMENT 'SHA-256 del archivo al momento de aplicarlo',
         applied_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP COMMENT 'Cuándo se aplicó (o se marcó como aplicada)'
       ) COMMENT = 'Migraciones ya aplicadas en esta base (las registra db/migrate.js)'`
    )

    const [appliedRows] = await conn.query('SELECT name, checksum FROM schema_migrations')
    const applied = new Map(appliedRows.map(r => [r.name, r.checksum]))
    const files = listFiles()

    // ── Estado ───────────────────────────────────────────
    if (flag('status')) {
      for (const file of files) {
        const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
        const state = !applied.has(file) ? '⏳ pendiente'
          : applied.get(file) !== checksum(content) ? '⚠️  aplicada, pero el archivo cambió después'
          : '✅ aplicada'
        console.log(`${state.padEnd(45)} ${file}`)
      }
      return
    }

    // ── Línea de base: marcar sin ejecutar ───────────────
    if (flag('baseline')) {
      const until = option('until')
      if (!until) throw new Error('Indicá hasta qué migración marcar, por ejemplo --until=016')
      let marked = 0
      for (const file of files) {
        if (prefixOf(file) > until || applied.has(file)) continue
        const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
        await conn.query('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [file, checksum(content)])
        console.log(`📌 Marcada como aplicada: ${file}`)
        marked++
      }
      console.log(`\n${marked} migración(es) marcadas sin ejecutar.`)
      return
    }

    // ── Aplicar pendientes ───────────────────────────────
    const pending = files.filter(f => !applied.has(f))

    for (const file of files.filter(f => applied.has(f))) {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      if (applied.get(file) !== checksum(content)) {
        console.log(`⚠️  ${file} cambió después de aplicarse. No se vuelve a ejecutar: si el cambio hace falta en la base, va en una migración nueva.`)
      }
    }

    if (!pending.length) {
      console.log('✅ La base está al día. No hay migraciones pendientes.')
      return
    }

    for (const file of pending) {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      process.stdout.write(`▶️  ${file} ... `)
      try {
        await conn.query(stripUse(content))
        await conn.query('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [file, checksum(content)])
        console.log('ok')
      } catch (err) {
        // MySQL confirma cada CREATE/ALTER apenas se ejecuta (no hay
        // vuelta atrás para DDL), así que si falla a mitad de archivo
        // puede haber quedado aplicado en parte. Se frena para revisar.
        console.log('ERROR')
        console.error(`\n❌ ${file}: ${err.message}`)
        console.error('Se detuvo la ejecución. Corregí el problema y volvé a correr el comando:')
        console.error('las migraciones anteriores quedaron registradas y no se repiten.')
        process.exitCode = 1
        return
      }
    }

    console.log(`\n✅ ${pending.length} migración(es) aplicadas.`)
  } finally {
    await conn.end()
  }
}

main().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
