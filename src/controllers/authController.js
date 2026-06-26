const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Función para registrar un nuevo usuario (Admin, Subadmin o Cliente)
exports.registrarUsuario = async (req, res) => {
  try {
    const { nombre, correo, password, rol, permisos } = req.body;

    // 1. Revisamos que el correo no esté repetido
    const usuarioExistente = await User.findOne({ correo });
    if (usuarioExistente) {
      return res.status(400).json({ mensaje: 'Este correo ya está registrado en BAMBOO' });
    }

    // 2. Encriptamos la contraseña
    const salt = await bcrypt.genSalt(10);
    const passwordEncriptada = await bcrypt.hash(password, salt);

    // 3. Creamos el usuario en la base de datos
    const nuevoUsuario = new User({
      nombre,
      correo,
      password: passwordEncriptada,
      rol,
      permisos
    });

    await nuevoUsuario.save();
    res.status(201).json({ mensaje: 'Usuario creado con éxito' });

  } catch (error) {
    res.status(500).json({ mensaje: 'Error al registrar usuario', error: error.message });
  }
};

// Función para Iniciar Sesión y mantenerla guardada
exports.iniciarSesion = async (req, res) => {
  try {
    const { correo, password } = req.body;

    // 1. Buscamos al usuario por su correo
    const usuario = await User.findOne({ correo });
    if (!usuario) {
      return res.status(400).json({ mensaje: 'Correo o contraseña incorrectos' });
    }

    // 2. Comparamos la contraseña desencriptada
    const passwordValida = await bcrypt.compare(password, usuario.password);
    if (!passwordValida) {
      return res.status(400).json({ mensaje: 'Correo o contraseña incorrectos' });
    }

    // 3. Creamos el Gafete Digital (Token)
    // Aquí está la magia: le decimos que expire en 30 días ('30d')
    const token = jwt.sign(
      { id: usuario._id, rol: usuario.rol, permisos: usuario.permisos },
      process.env.JWT_SECRET,
      { expiresIn: '30d' } 
    );

    // ========================================================
// RESPUESTA DE INICIO DE SESIÓN CORREGIDA Y MAESTRA
// ========================================================
res.status(200).json({
    token, // Tu JWT token de siempre
    usuario: {
        _id: usuario._id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: usuario.rol || usuario.role, // Soporte para ambas llaves de rol
        // ⚠️ CRÍTICO: Enviamos la submatriz completa de los 16 booleanos de Atlas
        permisos: usuario.permisos || {} 
    }
});

  } catch (error) {
    res.status(500).json({ mensaje: 'Error al iniciar sesión', error: error.message });
  }
};