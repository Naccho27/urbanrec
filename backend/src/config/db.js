'use strict'

const mysql = require('mysql2/promise')
const { db }  = require('./env')

const pool = mysql.createPool({
  host:               db.host,
  port:               db.port,
  user:               db.user,
  password:           db.password,
  database:           db.name,
  waitForConnections: true,   // espera si todas las conexiones están en uso
  connectionLimit:    10,     // máximo de conexiones simultáneas
  queueLimit:         0,      // sin límite de requests en cola
  timezone:           'local' // usa la zona horaria local del servidor
})

// Verificar conexión al iniciar
pool.getConnection()
  .then(conn => {
    console.log('✅ Conexión a MySQL establecida')
    conn.release()
  })
  .catch(err => {
    console.error('❌ Error al conectar con MySQL:', err.message)
    process.exit(1)
  })

module.exports = pool