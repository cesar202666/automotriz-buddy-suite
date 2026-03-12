import React, { createContext, useContext, useState } from "react";

export interface Cliente {
  id: string;
  nombres: string;
  apellidos: string;
  direccion: string;
  telefono: string;
  email: string;
  docCedula: string | null;
  docCedulaName: string | null;
}

export interface Vehiculo {
  id: string;
  folio: string;
  patente: string;
  tipo: string;
  marca: string;
  modelo: string;
  anio: string;
  estado: "DISPONIBLE" | "VENDIDO" | "RESERVADO" | "EN PROCESO";
  precioVenta: number;
  precioCosto: number;
  sucursal: string;
  usuarioAsignado: string;
  combustible: string;
  nMotor: string;
  vin: string;
  color: string;
  kilometraje: number;
  ubicacion: string;
  comentarios: string;
  transmision: string;
  traccion: string;
  aireAcondicionado: boolean;
  equipamientoExtra: string[];
  fotos: string[];
}

export interface Consignatario {
  id: string;
  nombre: string;
  rut: string;
  telefono: string;
  email: string;
  vehiculo: string;
  patente: string;
  precio: number;
  estado: string;
  contrato: string | null;
  contratoName: string | null;
  fechaIngreso: string;
}

export type VentaEstado = "BORRADOR" | "PENDIENTE_VALIDACION" | "VALIDADA" | "ANULADA";
export type TipoVenta = "CREDITO" | "CREDITO_PIE" | "CREDITO_APP" | "CREDITO_PIE_APP" | "APP_PIE" | "EFECTIVO" | "APP";

export interface Venta {
  id: string;
  ejecutiva: string;
  fechaVenta: string;
  sucursal: string;
  clienteId: string;
  clienteNombre: string;
  informeTecnico: string | null;
  informeTecnicoName: string | null;
  patente: string;
  marca: string;
  modelo: string;
  precioRetoma: number;
  precioVenta: number;
  margenBruto: number;
  nCredito: string;
  comisionCredito: number;
  gastosAdmin: number;
  precioVtaFinal: number;
  creditoFirmado: string;
  creditoFirmadoDoc: string | null;
  creditoFirmadoDocName: string | null;
  montoPieCaja: number;
  prepago: string;
  prepagoDoc: string | null;
  prepagoDocName: string | null;
  documentacionVenta: string | null;
  documentacionVentaName: string | null;
  tipoVenta: TipoVenta;
  estado: VentaEstado;
  verificacion: boolean;
}

export interface CuentaPagar {
  id: string;
  concepto: string;
  vehiculo: string;
  clientePagar: string;
  duenio: string;
  sePagaA: string;
  cuentaCliente: string;
  montoTotal: number;
  pagadoFecha: number | string;
  fechaVencimiento: string;
  fechaUltimoPago: string;
}

export interface CuentaCobrar {
  id: string;
  idVenta: string;
  patente: string;
  fechaVenta: string;
  idComprador: string;
  nombreComprador: string;
  precioVenta: number;
  comisionCredito: number;
  tipoFinanciamiento: string;
}

export interface Adquisicion {
  id: string;
  empresa: string;
  tipoProcedencia: string;
  observaciones: string;
  patente: string;
  marca: string;
  modelo: string;
  anio: string;
  kilometraje: string;
  tipo: string;
  color: string;
  obsVehiculo: string;
  precioOriginal: number;
  fechaCompra: string;
  gastosExtra: { descripcion: string; monto: number }[];
  costoTotal: number;
  precioSugerido: number;
}

export interface Usuario {
  id: string;
  nombre: string;
  clave: string;
  rol: "master" | "administracion" | "vendedor";
  email: string;
}

const USUARIOS_INICIALES: Usuario[] = [
  { id: "1", nombre: "César", clave: "123cuatro", rol: "master", email: "cesar@egana.cl" },
  { id: "2", nombre: "Pamela V.", clave: "pamela123", rol: "administracion", email: "pamela@egana.cl" },
  { id: "3", nombre: "Nicol M.", clave: "nicol123", rol: "vendedor", email: "nicol@egana.cl" },
];

interface AppState {
  clientes: Cliente[];
  setClientes: (c: Cliente[]) => void;
  vehiculos: Vehiculo[];
  setVehiculos: (v: Vehiculo[]) => void;
  consignatarios: Consignatario[];
  setConsignatarios: (c: Consignatario[]) => void;
  ventas: Venta[];
  setVentas: (v: Venta[]) => void;
  cuentasPagar: CuentaPagar[];
  setCuentasPagar: (c: CuentaPagar[]) => void;
  cuentasCobrar: CuentaCobrar[];
  setCuentasCobrar: (c: CuentaCobrar[]) => void;
  adquisiciones: Adquisicion[];
  setAdquisiciones: (a: Adquisicion[]) => void;
  usuarios: Usuario[];
  setUsuarios: (u: Usuario[]) => void;
  usuarioActual: Usuario | null;
  setUsuarioActual: (u: Usuario | null) => void;
}

const INITIAL_CLIENTES: Cliente[] = [
  { id: "101", nombres: "Juan", apellidos: "Perez", direccion: "Las Condes 102", telefono: "+56 9 1234 5678", email: "juan@demo.cl", docCedula: null, docCedulaName: null },
  { id: "102", nombres: "Maria", apellidos: "Gonzalez", direccion: "Providencia 45", telefono: "+56 9 8765 4321", email: "maria@demo.cl", docCedula: null, docCedulaName: null },
  { id: "103", nombres: "Renttmontt", apellidos: "SPA", direccion: "Santiago Centro 90", telefono: "+56 2 2233 4455", email: "contacto@renttmontt.cl", docCedula: null, docCedulaName: null },
  { id: "104", nombres: "Pedro", apellidos: "Vargas", direccion: "Ñuñoa 500", telefono: "+56 9 4444 5555", email: "pedro@demo.cl", docCedula: null, docCedulaName: null },
];

const INITIAL_VEHICULOS: Vehiculo[] = [
  {
    id: "1", folio: "00001", patente: "FDGT99", tipo: "AUTOMOVIL", marca: "HYUNDAI",
    modelo: "ELANTRA", anio: "2023", estado: "DISPONIBLE", precioVenta: 5790000,
    precioCosto: 4000000, sucursal: "Egaña", usuarioAsignado: "César", combustible: "Bencina",
    nMotor: "", vin: "", color: "Blanco", kilometraje: 45000, ubicacion: "Egaña",
    comentarios: "", transmision: "Transmisión Automática", traccion: "Tracción Delantera",
    aireAcondicionado: true, equipamientoExtra: [], fotos: []
  },
  {
    id: "2", folio: "00002", patente: "HXDD99", tipo: "AUTOMOVIL", marca: "CHEVROLET",
    modelo: "SPARK", anio: "2022", estado: "DISPONIBLE", precioVenta: 4900000,
    precioCosto: 3500000, sucursal: "Egaña", usuarioAsignado: "Pamela V.", combustible: "Bencina",
    nMotor: "", vin: "", color: "Rojo", kilometraje: 32000, ubicacion: "Egaña",
    comentarios: "", transmision: "Transmisión Manual", traccion: "Tracción Delantera",
    aireAcondicionado: true, equipamientoExtra: [], fotos: []
  },
];

const INITIAL_VENTAS: Venta[] = [
  {
    id: "1", ejecutiva: "BELEN O.", fechaVenta: "27-02-2026", sucursal: "EGAÑA", clienteId: "",
    clienteNombre: "", informeTecnico: null, informeTecnicoName: null, patente: "FDGT99",
    marca: "HYUNDAI", modelo: "ELANTRA", precioRetoma: 4000000, precioVenta: 5790000,
    margenBruto: 1790000, nCredito: "", comisionCredito: 166850, gastosAdmin: 200000,
    precioVtaFinal: 5756850, creditoFirmado: "NO", creditoFirmadoDoc: null, creditoFirmadoDocName: null,
    montoPieCaja: 1272500, prepago: "NO", prepagoDoc: null, prepagoDocName: null,
    documentacionVenta: null, documentacionVentaName: null, tipoVenta: "CREDITO", estado: "BORRADOR", verificacion: false
  },
];

const AppContext = createContext<AppState>({} as AppState);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [clientes, setClientes] = useState<Cliente[]>(INITIAL_CLIENTES);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>(INITIAL_VEHICULOS);
  const [consignatarios, setConsignatarios] = useState<Consignatario[]>([]);
  const [ventas, setVentas] = useState<Venta[]>(INITIAL_VENTAS);
  const [cuentasPagar, setCuentasPagar] = useState<CuentaPagar[]>([]);
  const [cuentasCobrar, setCuentasCobrar] = useState<CuentaCobrar[]>([]);
  const [adquisiciones, setAdquisiciones] = useState<Adquisicion[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>(USUARIOS_INICIALES);
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(USUARIOS_INICIALES[0]);

  return (
    <AppContext.Provider value={{
      clientes, setClientes,
      vehiculos, setVehiculos,
      consignatarios, setConsignatarios,
      ventas, setVentas,
      cuentasPagar, setCuentasPagar,
      cuentasCobrar, setCuentasCobrar,
      adquisiciones, setAdquisiciones,
      usuarios, setUsuarios,
      usuarioActual, setUsuarioActual,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
