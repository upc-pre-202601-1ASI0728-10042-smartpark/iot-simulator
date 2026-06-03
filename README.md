# SmartPark · IoT Simulator & Digital Twin

Repositorio del frente **IoT + Gemelo Digital** de SmartPark (Apex Twin).
Contiene el simulador IoT, la ontología DTDL, el modelo 3D y los scripts de
aprovisionamiento de **Azure Digital Twins** que sincronizan el gemelo.

## Ramas
- `main` — releases estables.
- `develop` — rama de integración (los PRs apuntan aquí).
- `feature/digital-twin-base` — **paquete base completo** del gemelo digital
  (ontología, modelo 3D, scripts Azure, simulador). Material de referencia desde
  el cual se derivan las feature branches que integran a `develop`.

## Flujo de trabajo
`feature/<tarea>` → Pull Request → `develop` → (release) → `main`.

> El detalle de uso está en el README del paquete (rama `feature/digital-twin-base`).
