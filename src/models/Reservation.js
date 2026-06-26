const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  // Datos del Cliente
  nombre_cliente: { type: String, required: true },
  correo: { type: String, required: true },
  telefono: { type: String, required: true },
  
  // Tipo de solicitud: reserva o visita
  tipo_solicitud: { type: String, enum: ['reserva', 'visita'], required: true },
  
  // Fechas y Horarios
  fecha_evento: { type: Date, required: true }, 
  hora_inicio: { type: String }, // Formato "HH:mm" (ej. "14:00")
  hora_fin: { type: String },    // Formato "HH:mm" (ej. "22:00")
  horas_extras: { type: Number, default: 0 }, // Cantidad de horas adicionales solicitadas
  
  // Detalles del Evento
  tipo_evento: { type: String }, 
  paquete: { 
    type: String, 
    enum: ['Paquete 1 (30 personas)', 'Paquete 2 (50 personas)', 'Paquete 3 (70 personas)', 'Paquete 4 (100 personas)', 'Ninguno']
  },
  sillas_adicionales: { type: Number, default: 0 },
  mesas_adicionales: { type: Number, default: 0 },
  solicitudes_adicionales: { type: String, default: '' },

  historial_modificaciones: [
    {
        usuario: { type: String, required: true },
        fecha_cambio: { type: Date, default: Date.now },
        motivo: { type: String, default: "Sin motivo especificado" },
        detalles: { type: String, required: true }
    }
],
  
  // Datos Administrativos
  estado: { 
    type: String, 
    enum: ['en_carrito', 'visita_agendada', 'pendiente_pago', 'confirmada', 'cancelada'], 
    default: 'en_carrito' 
  },
  anticipo_pagado: { type: Number, default: 0 },
  total_calculado: { type: Number, default: 0 }, 

  // Comodín para futuros ajustes
  datos_extra: { type: mongoose.Schema.Types.Mixed, default: {} }

  

}, { 
  timestamps: true 
});

module.exports = mongoose.model('Reservation', reservationSchema);