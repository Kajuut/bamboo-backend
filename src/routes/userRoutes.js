const express = require('express');
const router = express.Router();

// IMPORTANTE: Asegúrate de que la ruta a tu modelo 'Usuario' sea la correcta.
// Normalmente en tu estructura modular está en: '../models/Usuario' o similar.
// Si tu archivo del modelo se llama 'User', cambia 'Usuario' por 'User'.
const Usuario = require('../models/User');

// 1. RUTA PARA OBTENER TODOS LOS USUARIOS (Hace juego con cargarUsuariosSistema)
// RUTA COMPLETA Y BLINDADA EN USERROUTES.JS
router.get('/todos', async (req, res) => {
    try {
        // .lean() le dice a Mongoose: "Trae los datos directo de Atlas como JSON plano, sin filtrar por esquema"
        const usuarios = await Usuario.find({}, '-password').lean(); 
        
        console.log("Usuarios recuperados desde Atlas:", usuarios); // Esto imprimirá en tu terminal lo que llega
        
        res.status(200).json(usuarios);
    } catch (error) {
        console.error("Error al obtener los usuarios:", error);
        res.status(500).json({ mensaje: "Error interno del servidor al consultar personal." });
    }
});

// 2. RUTA PARA ACTUALIZAR LA MATRIZ DE PERMISOS (Hace juego con el submit de panel.js)
// 2. RUTA PARA ACTUALIZAR LA MATRIZ DE PERMISOS (Sincronizada Directa)
router.put('/permisos/:id', async (req, res) => {
    try {
        // CORRECCIÓN: Leemos directamente el JSON plano que manda tu panel.js
        const permisos = req.body.permisos || req.body;

        if (!permisos) {
            return res.status(400).json({ mensaje: "No se recibió la matriz de capacidades." });
        }

        // FORZAMOS EL MAPEO EXACTO DE TUS 16 LLAVES REALES DE ATLAS
        const actualizacionPermisos = {
            "permisos.acceso_vista_reservas": permisos.acceso_vista_reservas === true,
            "permisos.crear_nueva_reserva": permisos.crear_nueva_reserva === true,
            "permisos.acceso_panel_maestro": permisos.acceso_panel_maestro === true,
            "permisos.acceso_vista_metricas": permisos.acceso_vista_metricas === true,
            "permisos.editar_reservaciones": permisos.editar_reservaciones === true,
            "permisos.eliminar_reservaciones": permisos.eliminar_reservaciones === true,
            "permisos.aprobar_cancelar_reservas": permisos.aprobar_cancelar_reservas === true,
            "permisos.acceso_modulo_pagos": permisos.acceso_modulo_pagos === true,
            "permisos.registrar_pagos_anticipos": permisos.registrar_pagos_anticipos === true,
            "permisos.emitir_comprobantes": permisos.emitir_comprobantes === true,
            "permisos.gestionar_usuarios": permisos.gestionar_usuarios === true,
            "permisos.modificar_matriz_permisos": permisos.modificar_matriz_permisos === true,
            "permisos.acceso_vista_configuraciones": permisos.acceso_vista_configuraciones === true,
            "permisos.modificar_precios_paquetes": permisos.modificar_precios_paquetes === true,
            "permisos.bloquear_fechas_calendario": permisos.bloquear_fechas_calendario === true,
            "permisos.editar_datos_contacto": permisos.editar_datos_contacto === true
        };

        // Modificamos ÚNICAMENTE las propiedades internas sin destruir el documento
        const usuarioActualizado = await Usuario.findByIdAndUpdate(
            req.params.id,
            { $set: actualizacionPermisos },
            { new: true, runValidators: true }
        );

        if (!usuarioActualizado) {
            return res.status(404).json({ mensaje: "El usuario operativo no existe en Atlas." });
        }

        res.status(200).json({ 
            mensaje: "Matriz de privilegios grabada en piedra exitosamente.", 
            usuario: usuarioActualizado 
        });

    } catch (error) {
        console.error("Error crítico al actualizar permisos en el backend:", error);
        res.status(500).json({ mensaje: "Error interno al consolidar privilegios." });
    }
});

router.delete('/eliminar/:id', async (req, res) => {
    try {
        // Buscamos y destruimos el documento por su ID de MongoDB
        const usuarioEliminado = await Usuario.findByIdAndDelete(req.params.id);

        if (!usuarioEliminado) {
            return res.status(404).json({ mensaje: "El usuario que intentas eliminar ya no existe en el sistema." });
        }

        res.status(200).json({ mensaje: `El usuario ${usuarioEliminado.nombre} ha sido removido con éxito.` });
    } catch (error) {
        console.error("Error al eliminar usuario:", error);
        res.status(500).json({ mensaje: "Error interno del servidor al procesar la baja." });
    }
});

module.exports = router;