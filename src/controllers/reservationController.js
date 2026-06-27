const Reservation = require('../models/Reservation');

// Función para recibir datos y crear una reserva nueva
exports.crearReserva = async (req, res) => {
  try {
    // req.body contiene toda la información que enviaremos desde el formulario web
    const nuevaReserva = new Reservation(req.body);
    
    // 🚀 CANDADO DE RESPALDO: Si por un error de red el frontend no envía el parámetro,
    // el backend lo extrae de la sesión activa (req.user) antes de impactar Atlas.
    if (!nuevaReserva.creado_por || nuevaReserva.creado_por === 'Cliente Web / Manual') {
        if (req.user && req.user.nombre) {
            nuevaReserva.creado_por = req.user.nombre;
        }
    }
    
    // Guardamos la reserva en MongoDB
    const reservaGuardada = await nuevaReserva.save();
    
    // Le respondemos a la página web que todo salió bien (Status 201: Creado)
    res.status(201).json({ 
      mensaje: 'Reserva guardada en el carrito con éxito', 
      reserva: reservaGuardada 
    });
    
  } catch (error) {
    // Si falta un dato obligatorio (como el nombre), mandamos error
    res.status(400).json({ 
      mensaje: 'Error al intentar guardar la reserva', 
      error: error.message 
    });
  }
};

// Función para modificar una reserva existente (cuando el cliente edita su carrito)
exports.modificarReserva = async (req, res) => {
  try {
    // Obtenemos el ID de la reserva que viene en la URL
    const { id } = req.params; 
    
    // findByIdAndUpdate busca el ID y reemplaza los datos con lo nuevo que envíe el cliente
    // { new: true } es para que el servidor nos devuelva la versión ya actualizada, no la vieja
    const reservaActualizada = await Reservation.findByIdAndUpdate(id, req.body, { new: true });
    
    if (!reservaActualizada) {
      return res.status(404).json({ mensaje: 'No se encontró la reserva en el carrito' });
    }
    
    res.status(200).json({ 
      mensaje: 'Reserva modificada correctamente', 
      reserva: reservaActualizada 
    });
    
  } catch (error) {
    res.status(400).json({ 
      mensaje: 'Error al intentar modificar la reserva', 
      error: error.message 
    });
  }
};

// Función para eliminar una reserva del carrito
exports.eliminarReserva = async (req, res) => {
  try {
    // Obtenemos el ID de la reserva desde la URL
    const { id } = req.params; 
    
    // Le decimos a MongoDB que busque ese ID y lo borre por completo
    const reservaEliminada = await Reservation.findByIdAndDelete(id);
    
    // Si no encuentra nada, avisamos que ya no existe
    if (!reservaEliminada) {
      return res.status(404).json({ mensaje: 'La reserva ya no existe o no se encontró' });
    }
    
    // Respondemos que la operación fue un éxito
    res.status(200).json({ 
      mensaje: 'Reserva eliminada del carrito exitosamente'
    });
    
  } catch (error) {
    res.status(400).json({ 
      mensaje: 'Error al intentar eliminar la reserva', 
      error: error.message 
    });
  }
};

// Función para obtener los días ocupados (Para pintar el calendario)
exports.obtenerFechasOcupadas = async (req, res) => {
  try {
    // Buscamos todas las reservas que SÍ bloquean el día
    // $nin significa "Not In" (Excluimos las canceladas y las que siguen en carrito)
    const reservas = await Reservation.find({
      estado: { $nin: ['cancelada', 'en_carrito'] } 
    }).select('fecha_evento'); // .select() hace que MongoDB solo nos devuelva la fecha y no toda la información pesada del cliente

    // Convertimos el resultado en una lista sencilla y limpia de fechas
    const fechas = reservas.map(reserva => reserva.fecha_evento);

    // Le enviamos la lista a la página web
    res.status(200).json({ 
      mensaje: 'Fechas ocupadas obtenidas correctamente', 
      fechasOcupadas: fechas 
    });
    
  } catch (error) {
    res.status(500).json({ 
      mensaje: 'Error al intentar obtener las fechas del calendario', 
      error: error.message 
    });
  }
};

// Función para obtener los números del Panel de Control
exports.obtenerEstadisticas = async (req, res) => {
  try {
    // 1. Contamos cuántas están en el carrito
    const nuevas = await Reservation.countDocuments({ estado: 'en_carrito' });
    
    // 2. Contamos cuántas están confirmadas en total
    const confirmadas = await Reservation.countDocuments({ estado: 'confirmada' });
    
    // 3. Contamos los eventos confirmados que suceden desde hoy en adelante
    const hoy = new Date();
    const proximas = await Reservation.countDocuments({ 
        estado: 'confirmada', 
        fecha_evento: { $gte: hoy } 
    });

    res.status(200).json({ nuevas, proximas, confirmadas });
    
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener estadísticas', error: error.message });
  }
};

// Función para obtener TODAS las reservas para la tabla del Panel
exports.obtenerTodasLasReservas = async (req, res) => {
  try {
    // Busca todas las reservas y las ordena por fecha de creación (las más nuevas primero)
    const reservas = await Reservation.find().sort({ createdAt: -1 });
    res.status(200).json(reservas);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener la lista de reservas', error: error.message });
  }
};

// Actualizar toda la información de una reserva (Modificar)
// ========================================================
// 1. ACTUALIZAR RESERVA OPERATIVA (NOTAS INCLUIDAS)
// ========================================================
exports.actualizarReserva = async (req, res) => {
    try {
        const idReserva = req.params.id;
        const datosNuevos = req.body;
        
        // 🔮 SOLUCIÓN: Si viene usuario_accion del frontend lo usa, si no, busca el token o el fallback
        const nombreAdministrador = datosNuevos.usuario_accion || (req.user ? req.user.nombre : "Alexander");
        const motivoCambio = datosNuevos.motivo_modificacion || "Actualización general de rutina";

        const reservaPrevia = await Reservation.findById(idReserva);
        if (!reservaPrevia) {
            return res.status(404).json({ mensaje: "Reserva no encontrada en el sistema." });
        }

        const traducirEstado = (est) => {
            const dic = {
                'en_carrito': 'En Carrito',
                'visita_agendada': 'Visita Agendada',
                'pendiente_pago': 'Pendiente de Pago',
                'confirmada': 'Confirmada',
                'cancelada': 'Cancelada'
            };
            return dic[est] || est;
        };

        const formatearFechaHumana = (fechaStr) => {
            if (!fechaStr) return 'Sin fecha';
            const partes = fechaStr.split('-');
            if (partes.length !== 3) return fechaStr;
            const meses = [
                'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
            ];
            return `${partes[2]} de ${meses[parseInt(partes[1], 10) - 1]} de ${partes[0]}`;
        };

        const fechaPreviaISO = reservaPrevia.fecha_evento ? reservaPrevia.fecha_evento.toISOString().substring(0, 10) : '';
        const fechaNuevaISO = datosNuevos.fecha_evento || '';

        let bitacoraCambios = [];

        if (reservaPrevia.nombre_cliente !== datosNuevos.nombre_cliente) {
            bitacoraCambios.push(`• <b>Cliente:</b> Cambió de "${reservaPrevia.nombre_cliente}" a "${datosNuevos.nombre_cliente}"`);
        }
        if (reservaPrevia.correo !== datosNuevos.correo) {
            bitacoraCambios.push(`• <b>Correo:</b> Cambió de "${reservaPrevia.correo}" a "${datosNuevos.correo}"`);
        }
        if (reservaPrevia.telefono !== datosNuevos.telefono) {
            bitacoraCambios.push(`• <b>Teléfono:</b> Cambió de "${reservaPrevia.telefono}" a "${datosNuevos.telefono}"`);
        }
        if (fechaPreviaISO !== fechaNuevaISO) {
            bitacoraCambios.push(`• <b>Fecha:</b> Movida del [${formatearFechaHumana(fechaPreviaISO)}] al [${formatearFechaHumana(fechaNuevaISO)}]`);
        }
        if (reservaPrevia.hora_inicio !== datosNuevos.hora_inicio || reservaPrevia.hora_fin !== datosNuevos.hora_fin) {
            bitacoraCambios.push(`• <b>Horario:</b> Modificado de [${reservaPrevia.hora_inicio || '--:--'} a ${reservaPrevia.hora_fin || '--:--'}] a [${datosNuevos.hora_inicio} a ${datosNuevos.hora_fin}]`);
        }
        if (reservaPrevia.estado !== datosNuevos.estado) {
            bitacoraCambios.push(`• <b>Estado:</b> Cambió de <span class="badge ${reservaPrevia.estado}">${traducirEstado(reservaPrevia.estado)}</span> a <span class="badge ${datosNuevos.estado}">${traducirEstado(datosNuevos.estado)}</span>`);
        }
        if (reservaPrevia.paquete !== datosNuevos.paquete) {
            bitacoraCambios.push(`• <b>Paquete:</b> Modificado de "${reservaPrevia.paquete}" a "${datosNuevos.paquete}"`);
        }
        if (Number(reservaPrevia.horas_extras || 0) !== Number(datosNuevos.horas_extras || 0)) {
            bitacoraCambios.push(`• <b>Horas Extra:</b> De ${reservaPrevia.horas_extras || 0} hrs a ${datosNuevos.horas_extras} hrs`);
        }
        if (reservaPrevia.sillas_adicionales !== datosNuevos.sillas_adicionales) {
            bitacoraCambios.push(`• <b>Sillas Extra:</b> De ${reservaPrevia.sillas_adicionales || 0} a ${datosNuevos.sillas_adicionales} piezas`);
        }
        if (reservaPrevia.mesas_adicionales !== datosNuevos.mesas_adicionales) {
            bitacoraCambios.push(`• <b>Mesas Extra:</b> De ${reservaPrevia.mesas_adicionales || 0} a ${datosNuevos.mesas_adicionales} unidades`);
        }
        if (reservaPrevia.solicitudes_adicionales !== datosNuevos.solicitudes_adicionales) {
            const notasAntes = reservaPrevia.solicitudes_adicionales ? reservaPrevia.solicitudes_adicionales.trim() : 'Sin especificaciones';
            const notasNuevas = datosNuevos.solicitudes_adicionales ? datosNuevos.solicitudes_adicionales.trim() : 'Sin especificaciones';
            
            bitacoraCambios.push(`• <b>Detalles Extra:</b> Cambió de [<i>${notasAntes}</i>] a [<i>${notasNuevas}</i>]`);
        }
        if (Number(reservaPrevia.total_calculado || 0) !== Number(datosNuevos.total_calculado || 0)) {
            bitacoraCambios.push(`• <b>Monto Financiero:</b> El total se recalculó de $${Number(reservaPrevia.total_calculado || 0).toLocaleString('es-MX')} a $${Number(datosNuevos.total_calculado || 0).toLocaleString('es-MX')} MXN`);
        }

        const reporteFinalDeCambios = bitacoraCambios.length > 0 ? bitacoraCambios.join('<br>') : '• Se actualizaron notas internas o parámetros de rutina.';

        const nuevoTicketHistorial = {
            usuario: nombreAdministrador,
            fecha_cambio: new Date(),
            motivo: motivoCambio,
            detalles: reporteFinalDeCambios
        };

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
                    total_calculado: datosNuevos.total_calculado
                },
                $push: { historial_modificaciones: nuevoTicketHistorial }
            },
            { new: true }
        );

        res.json(reservaActualizada);
    } catch (error) {
        console.error("Error crítico en el controlador de auditoría:", error);
        res.status(500).json({ mensaje: "Error interno al procesar el historial avanzado", error });
    }
};

// ========================================================
// 2. INCREMENTAR ANTICIPO (AUDITORÍA INCORPORADA)
// ========================================================


// Lógica matemática para abonar anticipos
exports.incrementarAnticipo = async (req, res) => {
    try {
        const { monto_adicional } = req.body;
        const reserva = await Reservation.findById(req.params.id);
        
        if (!reserva) return res.status(404).json({ mensaje: 'Reserva no encontrada' });

        const nuevoAnticipo = (reserva.anticipo_pagado || 0) + Number(monto_adicional);

        if (nuevoAnticipo > reserva.total_calculado) {
            const restante = reserva.total_calculado - (reserva.anticipo_pagado || 0);
            return res.status(400).json({ 
                mensaje: `El monto excede la deuda. Solo faltan $${restante} MXN para liquidar el evento.` 
            });
        }

        const saldoAnterior = reserva.anticipo_pagado || 0;
        reserva.anticipo_pagado = nuevoAnticipo;

        if (reserva.anticipo_pagado === reserva.total_calculado) {
            reserva.estado = 'confirmada'; 
        }

        // 📝 CONSOLIDACIÓN: Creamos el ticket de auditoría para el abono financiero
        const nombreOperador = req.user ? req.user.nombre : "Alexander";
        const ticketPago = {
            usuario: nombreOperador,
            fecha_cambio: new Date(),
            motivo: "Registro de Abono / Anticipo",
            detalles: `• <b>Abono Recibido:</b> $${Number(monto_adicional).toLocaleString('es-MX')} MXN<br>• <b>Historial de Anticipos:</b> Pasó de $${saldoAnterior.toLocaleString('es-MX')} a $${nuevoAnticipo.toLocaleString('es-MX')} MXN.<br>• <b>Estatus Comercial:</b> ${reserva.anticipo_pagado === reserva.total_calculado ? 'Liquidado / Confirmado' : 'Abonado'}`
        };

        if (!reserva.historial_modificaciones) {
            reserva.historial_modificaciones = [];
        }
        reserva.historial_modificaciones.push(ticketPago);

        await reserva.save();
        res.status(200).json({ mensaje: 'Anticipo registrado con éxito', reserva });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al procesar el anticipo', error: error.message });
    }
};

// ========================================================
// RUTA DE INICIO: OBTENER AGENDA DE LOS PRÓXIMOS 7 DÍAS
// ========================================================
exports.obtenerAgendaSemanal = async (req, res) => {
    try {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0); // Desde las 00:00 del día actual

        const enSieteDias = new Date();
        enSieteDias.setDate(hoy.getDate() + 7);
        enSieteDias.setHours(23, 59, 59, 999); // Hasta el final del séptimo día

        // Buscamos eventos activos en este rango de fechas
        const eventosSemanales = await Reservation.find({
            fecha_evento: { $gte: hoy, $lte: enSieteDias },
            estado: { $ne: 'cancelada' }
        }).sort({ fecha_evento: 1, hora_inicio: 1 });

        res.status(200).json(eventosSemanales);
    } catch (error) {
        res.status(500).json({ 
            mensaje: 'Error al obtener la agenda semanal operativa', 
            error: error.message 
        });
    }
};