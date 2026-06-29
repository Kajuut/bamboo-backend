const Reservation = require('../models/Reservation');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const dns = require('dns');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
require('dns').setDefaultResultOrder('ipv4first');

// ☁️ CONFIGURACIÓN SUPREMA DE CLOUDINARY CON CREDENCIALES ASIGNADAS
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'delesitvk',
  api_key: process.env.CLOUDINARY_API_KEY || '355452653354782',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'v_-F6yewPD7z3QZ8yzWykTXg8HU'
});

// ========================================================
// 🧮 FUNCIONES AUXILIARES DE SOPORTE (PDF Y EMAIL)
// ========================================================

const procesarYGuardarReciboPDF = async (reserva, usuarioActivo) => {
    try {
        const plantillaPath = path.join(process.cwd(), 'src/templates/Recibo.pdf');
        const carpetaDestino = path.join(process.cwd(), 'public/recibos');

        if (!fs.existsSync(carpetaDestino)) {
            fs.mkdirSync(carpetaDestino, { recursive: true });
        }

        if (!fs.existsSync(plantillaPath)) {
            console.error("⚠️ Plantilla Recibo.pdf no encontrada en la raíz: templates/Recibo.pdf");
            return null;
        }

        const fileBuffer = fs.readFileSync(plantillaPath);
        const pdfDoc = await PDFDocument.load(fileBuffer);
        const primeraPagina = pdfDoc.getPages()[0];

        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontNormal = await pdfDoc.embedFont(StandardFonts.Helvetica);

        const hoy = new Date();
        const diaCreacion = String(hoy.getDate());
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const mesCreacion = meses[hoy.getMonth()];
        const anioCreacion = String(hoy.getFullYear());

        const totalStr = `$${Number(reserva.total_calculado || 0).toLocaleString('es-MX')}`;
        const liquidarStr = `$${Number((reserva.total_calculado || 0) - (reserva.anticipo_pagado || 0)).toLocaleString('es-MX')}`;
        
        const fechaEvObj = new Date(reserva.fecha_evento);
        const fechaEventoStr = `${fechaEvObj.getUTCDate()} DE ${meses[fechaEvObj.getUTCMonth()].toUpperCase()} DEL ${fechaEvObj.getUTCFullYear()}`;
        
        const rangoPagoStr = `${diaCreacion}/${String(hoy.getMonth()+1).padStart(2,'0')} a ${fechaEvObj.getUTCDate()}/${String(fechaEvObj.getUTCMonth()+1).padStart(2,'0')}`;

        primeraPagina.drawText(diaCreacion, { x: 243, y: 438, size: 20, font: fontBold });
        primeraPagina.drawText(mesCreacion, { x: 346, y: 438, size: 20, font: fontBold });
        primeraPagina.drawText(anioCreacion, { x: 443, y: 438, size: 20, font: fontBold });
        primeraPagina.drawText(totalStr, { x: 650, y: 445, size: 18, font: fontBold });
        primeraPagina.drawText(liquidarStr, { x: 650, y: 385, size: 18, font: fontBold });
        primeraPagina.drawText(reserva.nombre_cliente, { x: 155, y: 390, size: 18, font: fontBold });
        primeraPagina.drawText(reserva.paquete || 'Ninguno', { x: 273, y: 300, size: 20, font: fontBold });

        if (reserva.tipo_cobro === 'efectivo') primeraPagina.drawText('X', { x: 191, y: 233, size: 15, font: fontBold });
        if (reserva.tipo_cobro === 'cheque') primeraPagina.drawText('X', { x: 191, y: 204, size: 15, font: fontBold });
        if (reserva.tipo_cobro === 'transferencia') primeraPagina.drawText('X', { x: 191, y: 176, size: 15, font: fontBold });

        primeraPagina.drawText(reserva.telefono, { x: 651, y: 144, size: 18, font: fontBold });
        primeraPagina.drawText(fechaEventoStr, { x: 111, y: 86, size: 18, font: fontBold, color: rgb(0.1, 0.35, 0.2) });
        primeraPagina.drawText(rangoPagoStr, { x: 220, y: 44, size: 18, font: fontBold });
        primeraPagina.drawText(usuarioActivo, { x: 530, y: 93, size: 18, font: fontBold });

        const filename = `Recibo_Folio_${reserva._id}.pdf`;
        const savePath = path.join(carpetaDestino, filename);
        
        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(savePath, pdfBytes);

        // 🚀 SUBIDA INMEDIATA A CLOUDINARY EN CARPETA SEPARADA
        // Antes tenías resource_type: 'auto'
        // 🚀 Lo cambiamos a 'raw' para un manejo perfecto de documentos PDF
        const uploadResult = await cloudinary.uploader.upload(savePath, {
            folder: 'bamboo_recibos',
            public_id: `Recibo_Folio_${reserva._id}.pdf`, // Le agregamos explícitamente la extensión
            resource_type: 'raw'
        });

        return {
            filename: filename,
            savePath: savePath,
            secure_url: uploadResult.secure_url,
            public_id: uploadResult.public_id
        };
    } catch (e) {
        console.error("⚠️ Error interno generando o subiendo el archivo PDF:", e);
        return null;
    }
};

// ========================================================
// ✉️ MÓDULO DE ENVÍOS PROFESIONALES VÍA BREVO API (HTTPS)
// ========================================================
const enviarReciboPorCorreo = async (reserva, filename) => {
    if (!reserva.correo || reserva.correo === 'No proporcionado') return;

    try {
        // Apuntamos a la carpeta raíz pública de forma absoluta y segura
        const filePath = path.join(process.cwd(), 'public/recibos', filename);
        
        if (!fs.existsSync(filePath)) {
            console.error(`⚠️ No se pudo enviar el correo: El archivo ${filename} no existe en el disco temporal.`);
            return;
        }

        // Convertimos el PDF físico en una cadena binaria Base64 para la API de Brevo
        const pdfEnBase64 = fs.readFileSync(filePath).toString('base64');

        // Disparamos la petición HTTPS directa al endpoint v3 de Brevo (Puerto 443 seguro)
        const respuestaAPI = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': process.env.BREVO_API_KEY, // Tu nueva llave de Brevo en Render
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { 
                    name: "Salon BAMBOO", 
                    email: "salon.bamboo.reservaciones@gmail.com" // Tu Gmail verificado en Brevo
                },
                to: [
                    { 
                        email: reserva.correo, 
                        name: reserva.nombre_cliente 
                    }
                ],
                subject: `Confirmación de Recepción y Recibo Digital - Folio ${reserva._id.toString().substring(0,8).toUpperCase()}`,
                htmlContent: `<p>Hola <b>${reserva.nombre_cliente}</b>,</p>
                              <p>Hemos generado con éxito el comprobante digital de tu movimiento financiero para el evento programado el día <b>${new Date(reserva.fecha_evento).toLocaleDateString('es-MX')}</b>.</p>
                              <p>Adjunto a este correo encontrarás el documento PDF oficial correspondiente a tu recibo de arrendamiento.</p>
                              <br><p><i>Este es un correo automático, no es necesario responder. ¡Gracias por confiar en BAMBOO!</i></p>`,
                attachment: [
                    {
                        content: pdfEnBase64, // Cadena Base64 del archivo
                        name: "Recibo_Bamboo.pdf" // Nombre con el que le llegará al cliente
                    }
                ]
            })
        });

        // 🗑️ LIMPIEZA ABSOLUTA: Purgamos el archivo local inmediatamente después de procesar la petición
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Archivo temporal eliminado con éxito del servidor local: ${filename}`);
        }

        if (respuestaAPI.ok) {
            console.log(`✉️ ¡Recibo enviado con éxito vía Brevo API a la dirección: ${reserva.correo}!`);
        } else {
            const errorDetalle = await respuestaAPI.json();
            console.error("⚠️ Fallo en el servidor de Brevo API:", errorDetalle);
        }

    } catch (error) {
        console.error("⚠️ Error crítico en el proceso de despacho por API de Brevo:", error.message);
    }
};

// ========================================================
// 🛡️ ENDPOINTS DEL CONTROLADOR
// ========================================================

exports.crearReserva = async (req, res) => {
  try {
    const nuevaReserva = new Reservation(req.body);
    
    if (!nuevaReserva.creado_por || nuevaReserva.creado_por === 'Cliente Web / Manual') {
        if (req.user && req.user.nombre) {
            nuevaReserva.creado_por = req.user.nombre;
        }
    }
    
    const reservaGuardada = await nuevaReserva.save();

    if (reservaGuardada.tipo_solicitud === 'reserva') {
        const nombreOperador = reservaGuardada.creado_por;
        const pdfResult = await procesarYGuardarReciboPDF(reservaGuardada, nombreOperador);

        if (pdfResult) {
            reservaGuardada.recibo_cloud_id = pdfResult.public_id;
            reservaGuardada.recibo_url = pdfResult.secure_url;
            await reservaGuardada.save();

            // Se ejecuta de manera asíncrona en segundo plano sin congelar la respuesta web
            enviarReciboPorCorreo(reservaGuardada, pdfResult.filename);
        }
    }
    
    res.status(201).json({ 
      mensaje: 'Reserva guardada en el carrito con éxito', 
      reserva: reservaGuardada 
    });
    
  } catch (error) {
    res.status(400).json({ mensaje: 'Error al intentar guardar la reserva', error: error.message });
  }
};

exports.modificarReserva = async (req, res) => {
  try {
    const { id } = req.params; 
    const reservaActualizada = await Reservation.findByIdAndUpdate(id, req.body, { new: true });
    if (!reservaActualizada) {
      return res.status(404).json({ mensaje: 'No se encontró la reserva en el carrito' });
    }
    res.status(200).json({ mensaje: 'Reserva modificada correctamente', reserva: reservaActualizada });
  } catch (error) {
    res.status(400).json({ mensaje: 'Error al intentar modificar la reserva', error: error.message });
  }
};

exports.eliminarReserva = async (req, res) => {
  try {
    const { id } = req.params; 
    const reserva = await Reservation.findById(id);
    
    // 💥 PURGA DEFINITIVA DESDE LOS SERVIDORES DE CLOUDINARY
    if (reserva && reserva.recibo_cloud_id) {
        await cloudinary.uploader.destroy(reserva.recibo_cloud_id, { resource_type: 'raw' });
        console.log(`🗑_ Archivo borrado de Cloudinary al eliminar reserva: ${reserva.recibo_cloud_id}`);
    }

    const reservaEliminada = await Reservation.findByIdAndDelete(id);
    if (!reservaEliminada) return res.status(404).json({ mensaje: 'La reserva ya no existe' });
    
    res.status(200).json({ mensaje: 'Reserva eliminada del carrito exitosamente' });
  } catch (error) {
    res.status(400).json({ mensaje: 'Error al intentar eliminar la reserva', error: error.message });
  }
};

exports.obtenerFechasOcupadas = async (req, res) => {
  try {
    const reservas = await Reservation.find({ estado: { $nin: ['cancelada', 'en_carrito'] } }).select('fecha_evento');
    const fechas = reservas.map(reserva => reserva.fecha_evento);
    res.status(200).json({ mensaje: 'Fechas ocupadas obtenidas correctamente', fechasOcupadas: fechas });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al intentar obtener las fechas del calendario', error: error.message });
  }
};

exports.obtenerEstadisticas = async (req, res) => {
  try {
    const nuevas = await Reservation.countDocuments({ estado: 'en_carrito' });
    const confirmadas = await Reservation.countDocuments({ estado: 'confirmada' });
    const hoy = new Date();
    const proximas = await Reservation.countDocuments({ estado: 'confirmada', fecha_evento: { $gte: hoy } });
    res.status(200).json({ nuevas, proximas, confirmadas });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener estadísticas', error: error.message });
  }
};

exports.obtenerTodasLasReservas = async (req, res) => {
  try {
    const reservas = await Reservation.find().sort({ createdAt: -1 });
    res.status(200).json(reservas);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener la lista de reservas', error: error.message });
  }
};

exports.actualizarReserva = async (req, res) => {
    try {
        const idReserva = req.params.id;
        const datosNuevos = req.body;
        
        const nombreAdministrador = datosNuevos.usuario_accion || (req.user ? req.user.nombre : "Alexander");
        const motivoChange = datosNuevos.motivo_modificacion || "Actualización general de rutina";

        const reservaPrevia = await Reservation.findById(idReserva);
        if (!reservaPrevia) return res.status(404).json({ mensaje: "Reserva no encontrada." });

        const traducirEstado = (est) => {
            const dic = { 'en_carrito': 'En Carrito', 'visita_agendada': 'Visita Agendada', 'pendiente_pago': 'Pendiente de Pago', 'confirmada': 'Confirmada', 'cancelada': 'Cancelada' };
            return dic[est] || est;
        };

        const formatearFechaHumana = (fechaStr) => {
            if (!fechaStr) return 'Sin fecha';
            const partes = fechaStr.split('-');
            if (partes.length !== 3) return fechaStr;
            const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            return `${partes[2]} de ${meses[parseInt(partes[1], 10) - 1]} de ${partes[0]}`;
        };

        const fechaPreviaISO = reservaPrevia.fecha_evento ? reservaPrevia.fecha_evento.toISOString().substring(0, 10) : '';
        const fechaNuevaISO = datosNuevos.fecha_evento || '';

        let bitacoraCambios = [];
        if (reservaPrevia.nombre_cliente !== datosNuevos.nombre_cliente) bitacoraCambios.push(`• <b>Cliente:</b> Cambió de "${reservaPrevia.nombre_cliente}" a "${datosNuevos.nombre_cliente}"`);
        if (reservaPrevia.correo !== datosNuevos.correo) bitacoraCambios.push(`• <b>Correo:</b> Cambió de "${reservaPrevia.correo}" a "${datosNuevos.correo}"`);
        if (reservaPrevia.telefono !== datosNuevos.telefono) bitacoraCambios.push(`• <b>Teléfono:</b> Cambió de "${reservaPrevia.telefono}" a "${datosNuevos.telefono}"`);
        if (fechaPreviaISO !== fechaNuevaISO) bitacoraCambios.push(`• <b>Fecha:</b> Movida del [${formatearFechaHumana(fechaPreviaISO)}] al [${formatearFechaHumana(fechaNuevaISO)}]`);
        if (reservaPrevia.hora_inicio !== datosNuevos.hora_inicio || reservaPrevia.hora_fin !== datosNuevos.hora_fin) bitacoraCambios.push(`• <b>Horario:</b> Modificado de [${reservaPrevia.hora_inicio || '--:--'} a ${reservaPrevia.hora_fin || '--:--'}] a [${datosNuevos.hora_inicio} a ${datosNuevos.hora_fin}]`);
        if (reservaPrevia.estado !== datosNuevos.estado) bitacoraCambios.push(`• <b>Estado:</b> Cambió de <span class="badge ${reservaPrevia.estado}">${traducirEstado(reservaPrevia.estado)}</span> a <span class="badge ${datosNuevos.estado}">${traducirEstado(datosNuevos.estado)}</span>`);
        if (reservaPrevia.paquete !== datosNuevos.paquete) bitacoraCambios.push(`• <b>Paquete:</b> Modificado de "${reservaPrevia.paquete}" a "${datosNuevos.paquete}"`);
        if (Number(reservaPrevia.horas_extras || 0) !== Number(datosNuevos.horas_extras || 0)) bitacoraCambios.push(`• <b>Horas Extra:</b> De ${reservaPrevia.horas_extras || 0} hrs a ${datosNuevos.horas_extras} hrs`);
        if (reservaPrevia.sillas_adicionales !== datosNuevos.sillas_adicionales) bitacoraCambios.push(`• <b>Sillas Extra:</b> De ${reservaPrevia.sillas_adicionales || 0} a ${datosNuevos.sillas_adicionales} piezas`);
        if (reservaPrevia.mesas_adicionales !== datosNuevos.mesas_adicionales) bitacoraCambios.push(`• <b>Mesas Extra:</b> De ${reservaPrevia.mesas_adicionales || 0} a ${datosNuevos.mesas_adicionales} unidades`);
        if (reservaPrevia.solicitudes_adicionales !== datosNuevos.solicitudes_adicionales) bitacoraCambios.push(`• <b>Detalles Extra:</b> Cambió de [<i>${reservaPrevia.solicitudes_adicionales || 'Sin notas'}</i>] a [<i>${datosNuevos.solicitudes_adicionales || 'Sin notas'}</i>]`);
        if (Number(reservaPrevia.total_calculado || 0) !== Number(datosNuevos.total_calculado || 0)) bitacoraCambios.push(`• <b>Monto Financiero:</b> El total se recalculó de $${Number(reservaPrevia.total_calculado || 0).toLocaleString('es-MX')} a $${Number(datosNuevos.total_calculado || 0).toLocaleString('es-MX')} MXN`);

        const reporteFinalDeCambios = bitacoraCambios.length > 0 ? bitacoraCambios.join('<br>') : '• Se actualizaron notas internas o parámetros de rutina.';

        const nuevoTicketHistorial = { usuario: nombreAdministrador, fecha_change: new Date(), fecha_cambio: new Date(), motivo: motivoChange, detalles: reporteFinalDeCambios };

        let camposReciboUpdate = {};
        if (datosNuevos.regenerar_recibo === true && reservaPrevia.tipo_solicitud === 'reserva') {
            if (reservaPrevia.recibo_cloud_id) {
                await cloudinary.uploader.destroy(reservaPrevia.recibo_cloud_id, { resource_type: 'raw' }).catch(() => {});
            }
            
            const clonReservaParaPDF = { ...reservaPrevia._doc, ...datosNuevos };
            const pdfResult = await procesarYGuardarReciboPDF(clonReservaParaPDF, nombreAdministrador);
            
            if (pdfResult) {
                camposReciboUpdate.recibo_cloud_id = pdfResult.public_id;
                camposReciboUpdate.recibo_url = pdfResult.secure_url;
                nuevoTicketHistorial.detalles += `<br>• <b>Recibo Digital:</b> El archivo PDF fue regenerado y actualizado con éxito en la nube permanente de Cloudinary.`;
                
                enviarReciboPorCorreo(clonReservaParaPDF, pdfResult.filename);
            }
        }

        const reservaActualizada = await Reservation.findByIdAndUpdate(
            idReserva,
            {
                $set: {
                    nombre_cliente: datosNuevos.nombre_cliente,
                    correo: datosNuevos.correo,
                    telefono: datosNuevos.telefono,
                    fecha_evento: datosNuevos.fecha_evento,
                    hora_inicio: datosNuevos.hora_inicio,
                    hora_fin: datosNuevos.hora_fin,
                    estado: datosNuevos.estado,
                    paquete: datosNuevos.paquete,
                    horas_extras: datosNuevos.horas_extras,
                    sillas_adicionales: datosNuevos.sillas_adicionales,
                    mesas_adicionales: datosNuevos.mesas_adicionales,
                    solicitudes_adicionales: datosNuevos.solicitudes_adicionales, 
                    total_calculado: datosNuevos.total_calculado,
                    tipo_cobro: datosNuevos.tipo_cobro || reservaPrevia.tipo_cobro,
                    ...camposReciboUpdate
                },
                $push: { historial_modificaciones: nuevoTicketHistorial }
            },
            { new: true }
        );

        res.json(reservaActualizada);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: "Error interno al procesar el historial avanzado", error: error.message });
    }
};

exports.incrementarAnticipo = async (req, res) => {
    try {
        const { monto_adicional, tipo_cobro } = req.body;
        const reserva = await Reservation.findById(req.params.id);
        if (!reserva) return res.status(404).json({ mensaje: 'Reserva no encontrada' });

        const nuevoAnticipo = (reserva.anticipo_pagado || 0) + Number(monto_adicional);
        if (nuevoAnticipo > reserva.total_calculado) {
            const restante = reserva.total_calculado - (reserva.anticipo_pagado || 0);
            return res.status(400).json({ mensaje: `El monto excede la deuda. Solo faltan $${restante} MXN para liquidar el evento.` });
        }

        const saldoAnterior = reserva.anticipo_pagado || 0;
        reserva.anticipo_pagado = nuevoAnticipo;
        if (tipo_cobro) reserva.tipo_cobro = tipo_cobro;

        if (reserva.anticipo_pagado === reserva.total_calculado) reserva.estado = 'confirmada'; 

        const nombreOperador = req.body.usuario_accion || (req.user ? req.user.nombre : "Alexander");
        const ticketPago = {
            usuario: nombreOperador,
            fecha_change: new Date(),
            fecha_cambio: new Date(),
            motivo: "Registro de Abono / Anticipo",
            detalles: `• <b>Abono Recibido:</b> $${Number(monto_adicional).toLocaleString('es-MX')} MXN<br>• <b>Método de Cobro:</b> ${tipo_cobro || 'No especificado'}<br>• <b>Historial de Anticipos:</b> Pasó de $${saldoAnterior.toLocaleString('es-MX')} a $${nuevoAnticipo.toLocaleString('es-MX')} MXN.`
        };

        reserva.historial_modificaciones.push(ticketPago);
        await reserva.save();
        res.status(200).json({ mensaje: 'Anticipo registrado con éxito', reserva });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al procesar el anticipo', error: error.message });
    }
};

exports.obtenerAgendaSemanal = async (req, res) => {
    try {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const enSieteDias = new Date(); enSieteDias.setDate(hoy.getDate() + 7); enSieteDias.setHours(23, 59, 59, 999);
        const eventosSemanales = await Reservation.find({ fecha_evento: { $gte: hoy, $lte: enSieteDias }, estado: { $ne: 'cancelada' } }).sort({ fecha_evento: 1, hora_inicio: 1 });
        res.status(200).json(eventosSemanales);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener la agenda semanal operativa', error: error.message });
    }
};

exports.eliminarReciboManual = async (req, res) => {
    try {
        const { id } = req.params;
        const nombreOperador = req.body.usuario_accion || (req.user ? req.user.nombre : "Alexander");
        const reserva = await Reservation.findById(id);

        if (!reserva) return res.status(404).json({ mensaje: "Reserva no encontrada." });

        if (reserva.recibo_cloud_id) {
            await cloudinary.uploader.destroy(reserva.recibo_cloud_id, { resource_type: 'raw' }).catch(() => {});
        }

        reserva.recibo_url = '';
        reserva.recibo_cloud_id = '';

        const ticketBorrado = {
            usuario: nombreOperador,
            fecha_change: new Date(),
            fecha_cambio: new Date(),
            motivo: "Purga de Recibo Digital Manual",
            detalles: `• <b>Acción Administrativa:</b> El archivo PDF del recibo de pago fue eliminado permanentemente de la nube de Cloudinary por orden directa del Staff.`
        };
        reserva.historial_modificaciones.push(ticketBorrado);
        await reserva.save();

        res.status(200).json({ mensaje: "El recibo físico ha sido purgado correctamente de Cloudinary", reserva });
    } catch (e) {
        res.status(500).json({ mensaje: "Error al purgar el recibo manual", error: e.message });
    }
};

// ========================================================
// ⏰ TAREA AUTOMÁTICA DIARIA DE CLOUDINARY
// ========================================================
cron.schedule('0 0 * * *', async () => {
    console.log("⏱️ Iniciando escaneo diario de mantenimiento preventivo BAMBOO Cloud...");
    try {
        const hoy = new Date();
        const limiteCincoDias = new Date();
        limiteCincoDias.setDate(hoy.getDate() - 5);

        const recibosExpirados = await Reservation.find({
            fecha_evento: { $lt: limiteCincoDias },
            recibo_cloud_id: { $ne: '' }
        });

        for (const reserva of recibosExpirados) {
            if (reserva.recibo_cloud_id) {
               await cloudinary.uploader.destroy(reserva.recibo_cloud_id, { resource_type: 'raw' }).catch(() => {});
            }
            reserva.recibo_url = '';
            reserva.recibo_cloud_id = '';
            await reserva.save();
            console.log(`🗑️ Recibo ${reserva.recibo_cloud_id} purgado de Cloudinary tras 5 días.`);
        }

        const mananaInicio = new Date(); mananaInicio.setDate(hoy.getDate() + 1); mananaInicio.setHours(0,0,0,0);
        const mananaFin = new Date(); mananaFin.setDate(hoy.getDate() + 1); mananaFin.setHours(23,59,59,999);
        const eventosDeManana = await Reservation.find({ fecha_evento: { $gte: mananaInicio, $lte: mananaFin }, estado: { $ne: 'cancelada' } });

        eventosDeManana.forEach(evento => {
            console.log(`📢 [ALERTA WEB PUSH CRON] Evento para mañana: ${evento.nombre_cliente}`);
        });
    } catch (error) {
        console.error("⚠️ Error en el mantenimiento CRON:", error.message);
    }
});

// ========================================================
// 🕶️ CONTROLADORES PREMIUM PARA LA VENTANA SECRETA
// ========================================================
exports.listarRecibosDev = async (req, res) => {
    try {
        // Conexión viva a la API estructural de Cloudinary para auditar el folder real
        const result = await cloudinary.api.resources({
          resource_type: 'raw',
            type: 'upload',
            prefix: 'bamboo_recibos/',
            max_results: 100
        });

        const archivosFormateados = result.resources.map(file => ({
            public_id: file.public_id,
            secure_url: file.secure_url,
            created_at: file.created_at,
            bytes: file.bytes,
            format: file.format
        }));

        res.json({
            total_archivos: archivosFormateados.length,
            carpeta_servidor: "Cloudinary Nube Destino (Carpeta: bamboo_recibos)",
            archivos: archivosFormateados
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.borrarReciboDirectoDev = async (req, res) => {
    try {
        const { filename } = req.params; // Captura el public_id enviado por el Frontend
        
        await cloudinary.uploader.destroy(filename, { resource_type: 'raw' });
        return res.json({ mensaje: `El archivo ${filename} fue destruido con éxito de Cloudinary.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};