// =====================================================================
//  CONTROL DE PATIO — DATOS DE LA OPERACIÓN
//  Rellena todo lo marcado con  ▶ RELLENAR.  Se carga con:  npm run seed
//  Después todo se edita desde el sistema (usuario admin) y vive en PostgreSQL.
//  npm run seed -- --sobrescribir  vuelve a aplicar este archivo encima.
// =====================================================================

module.exports = {
  empresa: 'Control de Patio', // ▶ RELLENAR nombre que sale en el encabezado

  // ---------------------------------------------------------------
  // REGLAS GENERALES
  // ---------------------------------------------------------------
  reglas: {
    precioDieselLitro: 0,        // ▶ RELLENAR MXN por litro
    toleranciaRetardoMin: 5,     // retardo = más de N min tarde
    metaPuntualidadPct: 90,      // línea punteada de la gráfica de puntualidad
    ralentiAlertaPct: 15,        // ralentí en naranja arriba de este %
    neumaticoCambiarMm: 3,       // menos de esto = cambiar
    neumaticoVigilarMm: 5,       // menos de esto = vigilar
    intervaloServicioKm: 10000,  // cada cuántos km toca servicio
    diasAvisoDocumentos: 45,     // alerta cuando un documento vence en menos días
    radioParadaM: 80,            // radio para dar por visitada una parada con el GPS
  },

  // Tipos de unidad (se usan para capacidad, meta y presión por defecto)
  tipos: {
    'Autobús':  { capacidad: 45, metaKml: 3.4, psiObjetivo: 110 }, // ▶ RELLENAR metas reales
    'Sprinter': { capacidad: 20, metaKml: 7.0, psiObjetivo: 65 },
  },

  // ---------------------------------------------------------------
  // UNIDADES  (el campo "unidad" debe ser IDÉNTICO al nombre en Samsara)
  //  tipo: 'Autobús' | 'Sprinter'   anio, placas, tanqueLitros, polizaVence (AAAA-MM-DD)
  //  metaKml / capacidad / psiObjetivo: null = usa el valor del tipo
  // ---------------------------------------------------------------
  unidades: [
    { unidad: 'C02',   tipo: 'Sprinter', cliente: 'MODINE',   anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'C08',   tipo: 'Sprinter', cliente: 'MODINE',   anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'C15',   tipo: 'Sprinter', cliente: 'MODINE',   anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'C19',   tipo: 'Sprinter', cliente: 'MODINE',   anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'C23',   tipo: 'Sprinter', cliente: 'LINAMAR',  anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'C29',   tipo: 'Sprinter', cliente: 'MODINE',   anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'C35',   tipo: 'Sprinter', cliente: 'WIEGAND',  anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'C42',   tipo: 'Sprinter', cliente: 'LINAMAR',  anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'C51',   tipo: 'Sprinter', cliente: 'LINAMAR',  anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'C53',   tipo: 'Sprinter', cliente: 'WIEGAND',  anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'C54',   tipo: 'Sprinter', cliente: 'LINAMAR',  anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'C58',   tipo: 'Sprinter', cliente: 'WIEGAND',  anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'C91',   tipo: 'Sprinter', cliente: 'WIEGAND',  anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'C97',   tipo: 'Sprinter', cliente: 'LINAMAR',  anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'C107',  tipo: 'Sprinter', cliente: 'LINAMAR',  anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'TP01',  tipo: 'Autobús',  cliente: 'CLS',      anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'TP06',  tipo: 'Autobús',  cliente: 'MODINE',   anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'TP08',  tipo: 'Autobús',  cliente: 'LINAMAR',  anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'TP14',  tipo: 'Autobús',  cliente: 'CLS',      anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'TP15',  tipo: 'Autobús',  cliente: 'CLS',      anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'TP24',  tipo: 'Autobús',  cliente: 'CLS',      anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'TP25',  tipo: 'Autobús',  cliente: 'CLS',      anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'TP27',  tipo: 'Autobús',  cliente: 'CLS',      anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'TP32',  tipo: 'Autobús',  cliente: 'CLS',      anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'TP37',  tipo: 'Autobús',  cliente: 'MODINE',   anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'TP38',  tipo: 'Autobús',  cliente: 'MODINE',   anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'TP49',  tipo: 'Autobús',  cliente: 'LINAMAR',  anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    { unidad: 'TP51',  tipo: 'Autobús',  cliente: 'LINAMAR',  anio: null, placas: '', tanqueLitros: null, polizaVence: null, metaKml: null },
    // ▶ RELLENAR anio, placas, tanqueLitros y polizaVence de cada unidad; agrega las que falten
  ],

  // ---------------------------------------------------------------
  // CHOFERES   licenciaVence: AAAA-MM-DD
  // ---------------------------------------------------------------
  choferes: [
    // ▶ RELLENAR
    // { nombre: 'Juan Martínez', telefono: '', licenciaVence: '2027-03-14', unidad: 'TP49' },
  ],

  // ---------------------------------------------------------------
  // PLANTAS (geocercas de llegada/salida de cada cliente)
  //  lat/lng: ▶ RELLENAR (Google Maps > clic derecho > copiar coordenadas)
  // ---------------------------------------------------------------
  plantas: [
    { cliente: 'LINAMAR', nombre: 'Planta Linamar', lat: null, lng: null, radioM: 300 },
    { cliente: 'MODINE',  nombre: 'Planta Modine',  lat: null, lng: null, radioM: 300 },
    { cliente: 'WIEGAND', nombre: 'Planta Wiegand', lat: null, lng: null, radioM: 300 },
    { cliente: 'CLS',     nombre: 'Planta CLS',     lat: null, lng: null, radioM: 300 },
  ],

  // Otras geocercas (patio, gasolinera, taller…)
  geocercas: [
    { nombre: 'Patio / Base', tipo: 'PATIO', lat: null, lng: null, radioM: 200 },       // ▶ RELLENAR
    { nombre: 'Gasolinera', tipo: 'GASOLINERA', lat: null, lng: null, radioM: 100 },   // ▶ RELLENAR
  ],

  mapaCentro: { lat: 27.4763, lng: -99.5164, zoom: 12 },

  // ---------------------------------------------------------------
  // RUTAS  (tomadas de tu hoja de asignaciones)
  //  sentido ENTRADA: colonia → planta; "hora" = llegada a planta
  //  sentido SALIDA:  planta → colonia; "hora" = salida de planta
  //  duracionMin: ▶ RELLENAR minutos que dura el recorrido
  //  paradas: ▶ RELLENAR puntos de abordaje en orden
  //           { nombre, lat, lng, minDesdeInicio }
  // ---------------------------------------------------------------
  rutas: [
    // LINAMAR · ENTRADA 15:00
    { cliente: 'LINAMAR', sentido: 'ENTRADA', hora: '15:00', nombre: 'RESERVAS',              unidad: 'C51',  duracionMin: 45, paradas: [{ nombre: 'RESERVAS', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'LINAMAR', sentido: 'ENTRADA', hora: '15:00', nombre: 'VALLES/VILLAS',         unidad: 'C97',  duracionMin: 45, paradas: [{ nombre: 'VALLES/VILLAS', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'LINAMAR', sentido: 'ENTRADA', hora: '15:00', nombre: 'NUEVA VICTORIA',        unidad: 'C107', duracionMin: 45, paradas: [{ nombre: 'NUEVA VICTORIA', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'LINAMAR', sentido: 'ENTRADA', hora: '15:00', nombre: 'KM',                    unidad: 'TP49', duracionMin: 45, paradas: [{ nombre: 'KM', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'LINAMAR', sentido: 'ENTRADA', hora: '15:00', nombre: 'APOYO KM',              unidad: 'TP08', duracionMin: 45, paradas: [{ nombre: 'APOYO KM', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'LINAMAR', sentido: 'ENTRADA', hora: '15:00', nombre: 'FRESNOS GEO',           unidad: 'C23',  duracionMin: 45, paradas: [{ nombre: 'FRESNOS GEO', lat: null, lng: null, minDesdeInicio: 0 }] },
    // LINAMAR · SALIDA 16:36
    { cliente: 'LINAMAR', sentido: 'SALIDA',  hora: '16:36', nombre: 'RESERVAS',              unidad: 'C23',  duracionMin: 45, paradas: [{ nombre: 'RESERVAS', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'LINAMAR', sentido: 'SALIDA',  hora: '16:36', nombre: 'VILLAS/VALLES',         unidad: 'C42',  duracionMin: 45, paradas: [{ nombre: 'VILLAS/VALLES', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'LINAMAR', sentido: 'SALIDA',  hora: '16:36', nombre: 'VOLUNTADES',            unidad: 'TP08', duracionMin: 45, paradas: [{ nombre: 'VOLUNTADES', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'LINAMAR', sentido: 'SALIDA',  hora: '16:36', nombre: 'KM Y KM APOYO',         unidad: 'TP49', duracionMin: 45, paradas: [{ nombre: 'KM Y KM APOYO', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'LINAMAR', sentido: 'SALIDA',  hora: '16:36', nombre: 'FRESNOS GEO',           unidad: 'TP51', duracionMin: 45, paradas: [{ nombre: 'FRESNOS GEO', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'LINAMAR', sentido: 'SALIDA',  hora: '16:36', nombre: 'BACK UP',               unidad: 'C54',  duracionMin: 45, paradas: [{ nombre: 'BACK UP', lat: null, lng: null, minDesdeInicio: 0 }] },
    // MODINE · ENTRADA 15:00
    { cliente: 'MODINE',  sentido: 'ENTRADA', hora: '15:00', nombre: 'RESERVAS',              unidad: 'C02',  duracionMin: 45, paradas: [{ nombre: 'RESERVAS', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'MODINE',  sentido: 'ENTRADA', hora: '15:00', nombre: 'VILLAS',                unidad: 'C29',  duracionMin: 45, paradas: [{ nombre: 'VILLAS', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'MODINE',  sentido: 'ENTRADA', hora: '15:00', nombre: 'VALLES',                unidad: 'C08',  duracionMin: 45, paradas: [{ nombre: 'VALLES', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'MODINE',  sentido: 'ENTRADA', hora: '15:00', nombre: 'VOLUNTADES',            unidad: 'C15',  duracionMin: 45, paradas: [{ nombre: 'VOLUNTADES', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'MODINE',  sentido: 'ENTRADA', hora: '15:00', nombre: 'FRESNOS GEO',           unidad: 'TP38', duracionMin: 45, paradas: [{ nombre: 'FRESNOS GEO', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'MODINE',  sentido: 'ENTRADA', hora: '15:00', nombre: 'CAMPANARIO',            unidad: 'TP37', duracionMin: 45, paradas: [{ nombre: 'CAMPANARIO', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'MODINE',  sentido: 'ENTRADA', hora: '15:00', nombre: 'LOMAS',                 unidad: 'TP06', duracionMin: 45, paradas: [{ nombre: 'LOMAS', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'MODINE',  sentido: 'ENTRADA', hora: '15:00', nombre: 'CONSTITUCIONAL',        unidad: 'C19',  duracionMin: 45, paradas: [{ nombre: 'CONSTITUCIONAL', lat: null, lng: null, minDesdeInicio: 0 }] },
    // MODINE · SALIDA 16:06
    { cliente: 'MODINE',  sentido: 'SALIDA',  hora: '16:06', nombre: 'RESERVAS',              unidad: 'C19',  duracionMin: 45, paradas: [{ nombre: 'RESERVAS', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'MODINE',  sentido: 'SALIDA',  hora: '16:06', nombre: 'VILLAS',                unidad: 'C107', duracionMin: 45, paradas: [{ nombre: 'VILLAS', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'MODINE',  sentido: 'SALIDA',  hora: '16:06', nombre: 'VALLES',                unidad: 'C08',  duracionMin: 45, paradas: [{ nombre: 'VALLES', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'MODINE',  sentido: 'SALIDA',  hora: '16:06', nombre: 'FRESNOS GEO',           unidad: 'TP37', duracionMin: 45, paradas: [{ nombre: 'FRESNOS GEO', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'MODINE',  sentido: 'SALIDA',  hora: '16:06', nombre: 'CAMPANARIO',            unidad: 'TP38', duracionMin: 45, paradas: [{ nombre: 'CAMPANARIO', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'MODINE',  sentido: 'SALIDA',  hora: '16:06', nombre: 'J. LONGORIA',           unidad: 'C15',  duracionMin: 45, paradas: [{ nombre: 'J. LONGORIA', lat: null, lng: null, minDesdeInicio: 0 }] },
    // WIEGAND · SALIDA 15:30
    { cliente: 'WIEGAND', sentido: 'SALIDA',  hora: '15:30', nombre: 'INFONAVIT',             unidad: 'C35',  duracionMin: 45, paradas: [{ nombre: 'INFONAVIT', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'WIEGAND', sentido: 'SALIDA',  hora: '15:30', nombre: 'FCO VILLA',             unidad: 'C29',  duracionMin: 45, paradas: [{ nombre: 'FCO VILLA', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'WIEGAND', sentido: 'SALIDA',  hora: '15:30', nombre: 'LA JOYA',               unidad: 'C54',  duracionMin: 45, paradas: [{ nombre: 'LA JOYA', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'WIEGAND', sentido: 'SALIDA',  hora: '15:30', nombre: 'KM',                    unidad: 'TP08', duracionMin: 45, paradas: [{ nombre: 'KM', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'WIEGAND', sentido: 'SALIDA',  hora: '15:30', nombre: 'LOMAS',                 unidad: 'TP51', duracionMin: 45, paradas: [{ nombre: 'LOMAS', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'WIEGAND', sentido: 'SALIDA',  hora: '15:30', nombre: 'COLINAS',               unidad: 'C91',  duracionMin: 45, paradas: [{ nombre: 'COLINAS', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'WIEGAND', sentido: 'SALIDA',  hora: '15:30', nombre: 'RESERVAS',              unidad: 'C42',  duracionMin: 45, paradas: [{ nombre: 'RESERVAS', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'WIEGAND', sentido: 'SALIDA',  hora: '15:30', nombre: 'NUEVA ERA',             unidad: 'C53',  duracionMin: 45, paradas: [{ nombre: 'NUEVA ERA', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'WIEGAND', sentido: 'SALIDA',  hora: '15:30', nombre: 'VILLAS DE SAN MIGUEL',  unidad: 'C58',  duracionMin: 45, paradas: [{ nombre: 'VILLAS DE SAN MIGUEL', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'WIEGAND', sentido: 'SALIDA',  hora: '15:30', nombre: 'SOLIDARIDAD',           unidad: 'C23',  duracionMin: 45, paradas: [{ nombre: 'SOLIDARIDAD', lat: null, lng: null, minDesdeInicio: 0 }] },
    // CLS · ENTRADA 16:00
    { cliente: 'CLS',     sentido: 'ENTRADA', hora: '16:00', nombre: 'SOLIDARIDAD',           unidad: 'TP01', duracionMin: 45, paradas: [{ nombre: 'SOLIDARIDAD', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'CLS',     sentido: 'ENTRADA', hora: '16:00', nombre: 'RESERVAS',              unidad: 'TP25', duracionMin: 45, paradas: [{ nombre: 'RESERVAS', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'CLS',     sentido: 'ENTRADA', hora: '16:00', nombre: 'VALLES',                unidad: 'TP14', duracionMin: 45, paradas: [{ nombre: 'VALLES', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'CLS',     sentido: 'ENTRADA', hora: '16:00', nombre: 'KM',                    unidad: 'TP32', duracionMin: 45, paradas: [{ nombre: 'KM', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'CLS',     sentido: 'ENTRADA', hora: '16:00', nombre: 'FRESNOS',               unidad: 'TP27', duracionMin: 45, paradas: [{ nombre: 'FRESNOS', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'CLS',     sentido: 'ENTRADA', hora: '16:00', nombre: 'VILLAS',                unidad: 'TP24', duracionMin: 45, paradas: [{ nombre: 'VILLAS', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'CLS',     sentido: 'ENTRADA', hora: '16:00', nombre: 'CENTRO',                unidad: 'TP15', duracionMin: 45, paradas: [{ nombre: 'CENTRO', lat: null, lng: null, minDesdeInicio: 0 }] },
    // CLS · SALIDA 16:45
    { cliente: 'CLS',     sentido: 'SALIDA',  hora: '16:45', nombre: 'SOLIDARIDAD',           unidad: 'TP01', duracionMin: 45, paradas: [{ nombre: 'SOLIDARIDAD', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'CLS',     sentido: 'SALIDA',  hora: '16:45', nombre: 'RESERVAS',              unidad: 'TP25', duracionMin: 45, paradas: [{ nombre: 'RESERVAS', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'CLS',     sentido: 'SALIDA',  hora: '16:45', nombre: 'VALLES',                unidad: 'TP14', duracionMin: 45, paradas: [{ nombre: 'VALLES', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'CLS',     sentido: 'SALIDA',  hora: '16:45', nombre: 'KM',                    unidad: 'TP32', duracionMin: 45, paradas: [{ nombre: 'KM', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'CLS',     sentido: 'SALIDA',  hora: '16:45', nombre: 'FRESNOS',               unidad: 'TP15', duracionMin: 45, paradas: [{ nombre: 'FRESNOS', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'CLS',     sentido: 'SALIDA',  hora: '16:45', nombre: 'VILLAS',                unidad: 'TP24', duracionMin: 45, paradas: [{ nombre: 'VILLAS', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'CLS',     sentido: 'SALIDA',  hora: '16:45', nombre: 'CENTRO',                unidad: 'TP27', duracionMin: 45, paradas: [{ nombre: 'CENTRO', lat: null, lng: null, minDesdeInicio: 0 }] },
    { cliente: 'CLS',     sentido: 'SALIDA',  hora: '16:45', nombre: 'RUTA NUEVA',            unidad: 'TP06', duracionMin: 45, paradas: [{ nombre: 'RUTA NUEVA', lat: null, lng: null, minDesdeInicio: 0 }] },
  ],
};
