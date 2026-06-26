const express = require('express');
const router = express.Router();
const reservationController = require('../controllers/reservationController');

// Ruta para crear una reserva nueva
router.post('/nueva', reservationController.crearReserva);

// Ruta para obtener las fechas ocupadas (¡NUEVA!)
router.get('/fechas-ocupadas', reservationController.obtenerFechasOcupadas);

// Ruta para modificar una reserva existente
router.put('/modificar/:id', reservationController.modificarReserva);

// Ruta para eliminar una reserva (vaciar del carrito)
router.delete('/eliminar/:id', reservationController.eliminarReserva);

// Ruta para las estadísticas del panel
router.get('/estadisticas', reservationController.obtenerEstadisticas);

router.get('/agenda-semanal', reservationController.obtenerAgendaSemanal);

// Ruta para obtener todas las reservas (Para el panel de admin)
router.get('/todas', reservationController.obtenerTodasLasReservas);

// Rutas de modificación y finanzas
router.put('/:id', reservationController.actualizarReserva);
router.put('/:id/anticipo', reservationController.incrementarAnticipo);

module.exports = router;