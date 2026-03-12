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

const INITIAL_CLIENTES: Cliente[] = [];
const INITIAL_VEHICULOS: Vehiculo[] = [];
const INITIAL_VENTAS: Venta[] = [];

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
