const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Ruta para crear usuarios
router.post('/registro', authController.registrarUsuario);

// Ruta para iniciar sesión
router.post('/login', authController.iniciarSesion);

// ========================================================
// MOTOR DE VERIFICACIÓN OTP Y REGISTRO SEGURO (BAMBOO)
// ========================================================

// Almacenamiento temporal en memoria para los códigos OTP activos (Expira en 5 min)
const codigosOTPMemoria = new Map(); 
const bcrypt = require('bcryptjs'); // Asegúrate de tenerlo importado arriba para encriptar la clave
const Usuario = require('../models/User'); // El modelo que apunta a tu colección 'users'
const User = require('../models/User');

// --- 1. RUTA: SOLICITAR CÓDIGO OTP ---
router.post('/solicitar-otp', async (req, res) => {
    const { telefono, correo } = req.body;

    try {
        // Validación A: Verificar si el correo ya está registrado en tu Atlas
        // EJEMPLO SI TU VARIABLE ORIGINAL DE ARRIBA ES 'User':
const usuarioExiste = await User.findOne({ correo }); // <-- Cambiar aquí si es necesario
        if (usuarioExiste) {
            return res.status(400).json({ mensaje: "El correo electrónico ya se encuentra registrado en el sistema." });
        }

        // Generamos un código aleatorio de 4 dígitos (Rango de 1000 a 9999)
        // CORRECCIÓN: Agrupamos con paréntesis para asegurar la conversión limpia a String
const codigoGenerado = String(Math.floor(1000 + Math.random() * 9000));

        // Guardamos el código asociado al teléfono en la memoria con tiempo de expiración
        codigosOTPMemoria.set(telefono, {
            codigo: codigoGenerado,
            expiracion: Date.now() + (5 * 60 * 1000) // 5 minutos de vida útil
        });

        // SIMULACIÓN EJECUTIVA EN CONSOLA (Para tus pruebas de desarrollo)
        console.log("\n==============================================");
        console.log(`📱 [BAMBOO OTP] ENVIADO AL CELULAR: ${telefono}`);
        console.log(`🔑 TU CÓDIGO DE ACCESO ES: ${codigoGenerado}`);
        console.log("==============================================\n");

        res.status(200).json({ mensaje: "Código de verificación generado y enviado con éxito." });
    } catch (error) {
        console.error("Error al solicitar OTP:", error);
        res.status(500).json({ mensaje: "Error interno al procesar el código de seguridad." });
    }
});

// --- 2. RUTA: VERIFICAR CÓDIGO Y GUARDAR REGISTRO DEFINITIVO ---
router.post('/verificar-registro', async (req, res) => {
    const { nombre, correo, telefono, password, codigo } = req.body;

    try {
        // 1. Validar si existe un código emitido para ese número de teléfono
        const registroOTP = codigosOTPMemoria.get(telefono);

        if (!registroOTP) {
            return res.status(400).json({ mensaje: "No se ha solicitado ningún código para este número celular." });
        }

        // 2. Validar si el código ya expiró
        if (Date.now() > registroOTP.expiracion) {
            codigosOTPMemoria.delete(telefono); // Limpiamos memoria
            return res.status(400).json({ mensaje: "El código de verificación ha expirado. Solicita uno nuevo." });
        }

        // 3. Validar si el código coincide estrictamente con el ingresado
        if (registroOTP.codigo !== codigo) {
            return res.status(400).json({ mensaje: "El código de seguridad ingresado es incorrecto." });
        }

        // --- CÓDIGO CORRECTO: PROCEDEMOS AL REGISTRO EN ATLAS ---
        
        // Encriptamos la contraseña del cliente de forma segura (10 rondas de salt)
        const passwordEncriptada = await bcrypt.hash(password, 10);

        // Creamos el nuevo usuario con el rol predeterminado de 'cliente'
        const nuevoUsuario = new User({
            nombre,
            correo,
            password: passwordEncriptada,
            telefono,
            rol: 'cliente', // Por seguridad todo registro web entra como cliente
            permisos: {
                acceso_vista_reservas: true, // Permisos básicos iniciales para su propio perfil
                crear_nueva_reserva: true
            }
        });

        // Salvamos físicamente en tu colección 'users' de la base de datos 'bambok'
        await nuevoUsuario.save();

        // Limpiamos el código de la memoria para que no pueda reutilizarse
        codigosOTPMemoria.delete(telefono);

        res.status(201).json({ mensaje: "Usuario verificado y registrado exitosamente en BAMBOO." });

    } catch (error) {
        console.error("Error en verificación final:", error);
        res.status(500).json({ mensaje: "Error crítico al consolidar el perfil en Atlas." });
    }
});

module.exports = router;