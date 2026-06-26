const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
  tipo: { type: String, default: 'precios_globales', unique: true },
  
  // Precios de Lunes a Jueves
  precio_paquete1_semana: { type: Number, default: 0 },
  precio_paquete2_semana: { type: Number, default: 0 },
  precio_paquete3_semana: { type: Number, default: 0 },
  precio_paquete4_semana: { type: Number, default: 0 },

  // Precios de Viernes a Domingo
  precio_paquete1_fin: { type: Number, default: 0 },
  precio_paquete2_fin: { type: Number, default: 0 },
  precio_paquete3_fin: { type: Number, default: 0 },
  precio_paquete4_fin: { type: Number, default: 0 },

  // Extras configurables
  precio_silla_extra: { type: Number, default: 0 },
  precio_mesa_extra: { type: Number, default: 0 },
  precio_hora_extra: { type: Number, default: 0 } // <-- Nuevo campo añadido

}, { timestamps: true });

module.exports = mongoose.model('Config', configSchema);