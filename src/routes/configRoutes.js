const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');

// Ruta para ver los precios (Cualquiera podría verlos para que la página calcule el total)
router.get('/', configController.obtenerConfiguracion);

// Ruta para modificar los precios (Más adelante la protegeremos para que solo tú la uses)
router.put('/actualizar', configController.actualizarConfiguracion);

module.exports = router;