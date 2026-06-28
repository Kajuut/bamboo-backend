const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Configuraciones básicas (Middlewares)
app.use(cors({ origin: '*' })); // Permite que tu futura página web se comunique con este servidor
app.use(express.json());
const path = require('path');
// Le dice a Express que use la ruta absoluta completa hacia la carpeta 'public' de la raíz
app.use(express.static(path.join(__dirname, 'public')));// Permite que el servidor entienda datos en formato JSON

// Importar las rutas
const reservationRoutes = require('./src/routes/reservationRoutes');
const configRoutes = require('./src/routes/configRoutes'); 
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes'); // <-- 1. NUEVA IMPORTACIÓN MODULAR

// Usar las rutas
app.use('/api/reservas', reservationRoutes);
app.use('/api/config', configRoutes); 
app.use('/api/auth', authRoutes); 
app.use('/api/usuarios', userRoutes); // <-- 2. NUEVO ENRUTADOR VIVO CONECTADO

// Conexión a la base de datos MongoDB con parche de red
mongoose.connect(process.env.MONGO_URI, {
  family: 4, // Fuerza a Node.js a usar IPv4 y saltar el bloqueo ECONNREFUSED
  serverSelectionTimeoutMS: 5000 // Reduce el tiempo de espera si detecta lentitud
})
  .then(() => console.log('Conectado exitosamente a la base de datos de BAMBOO'))
  .catch((err) => console.error('Error al conectar con MongoDB:', err.message));

// Ruta de prueba para verificar que funciona
app.get('/', (req, res) => {
  res.send('El motor del Salón BAMBOO está funcionando correctamente.');
});

// Encender el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor de BAMBOO corriendo en el puerto ${PORT}`);
});