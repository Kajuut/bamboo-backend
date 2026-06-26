const Config = require('../models/Config');

// Función para obtener los precios actuales
exports.obtenerConfiguracion = async (req, res) => {
  try {
    // Busca el documento único de configuración
    let config = await Config.findOne({ tipo: 'precios_globales' });
    
    // Si es la primera vez que prendemos el sistema y no existe, lo crea en blanco
    if (!config) {
      config = await Config.create({ tipo: 'precios_globales' });
    }
    
    res.status(200).json(config);
  } catch (error) {
    res.status(500).json({ 
      mensaje: 'Error al obtener la configuración de precios', 
      error: error.message 
    });
  }
};

// Función para que los administradores actualicen los precios
exports.actualizarConfiguracion = async (req, res) => {
  try {
    // Busca el documento y lo reemplaza con los precios nuevos que envíes
    // { new: true, upsert: true } asegura que te devuelva el archivo nuevo y que lo cree si no existía
    const configActualizada = await Config.findOneAndUpdate(
      { tipo: 'precios_globales' },
      req.body,
      { new: true, upsert: true } 
    );
    
    res.status(200).json({ 
      mensaje: 'Precios actualizados correctamente', 
      config: configActualizada 
    });
  } catch (error) {
    res.status(400).json({ 
      mensaje: 'Error al actualizar los precios', 
      error: error.message 
    });
  }
};