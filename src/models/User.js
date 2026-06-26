const mongoose = require('mongoose');

const usuarioSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    correo: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    
   telefono: { type: String, default: 'No proporcionado' },

    // CORRECCIÓN CLAVE: Cambiar 'rol_etiqueta' por 'rol' para que machee con Atlas
    rol: { 
    type: String, 
    enum: ['admin', 'cliente', 'empleado'], // Agregamos 'empleado' de forma oficial
    default: 'cliente' 
}, 
    
    permisos: {
        // --- Bloque 1: Panel de Control General ---
        acceso_panel_maestro: { type: Boolean, default: false },
        acceso_vista_metricas: { type: Boolean, default: false },
        
        // --- Bloque 2: Gestión de Reservaciones ---
        acceso_vista_reservas: { type: Boolean, default: true }, // Clientes pueden ver sus reservas
        crear_nueva_reserva: { type: Boolean, default: true },   // Clientes pueden agendar
        editar_reservaciones: { type: Boolean, default: false },
        eliminar_reservaciones: { type: Boolean, default: false },
        aprobar_cancelar_reservas: { type: Boolean, default: false },

        // --- Bloque 3: Control Financiero ---
        acceso_modulo_pagos: { type: Boolean, default: false },
        registrar_pagos_anticipos: { type: Boolean, default: false },
        emitir_comprobantes: { type: Boolean, default: false },

        // --- Bloque 4: Control de Personal y Roles ---
        gestionar_usuarios: { type: Boolean, default: false },
        modificar_matriz_permisos: { type: Boolean, default: false },

        // --- Bloque 5: Configuraciones del Salón ---
        acceso_vista_configuraciones: { type: Boolean, default: false },
        modificar_precios_paquetes: { type: Boolean, default: false },
        bloquear_fechas_calendario: { type: Boolean, default: false },
        editar_datos_contacto: { type: Boolean, default: false }
    }
}, { timestamps: true });

// El tercer parámetro 'users' le ordena a Mongoose usar exactamente esa colección de tu Atlas
module.exports = mongoose.model('Usuario', usuarioSchema, 'users');