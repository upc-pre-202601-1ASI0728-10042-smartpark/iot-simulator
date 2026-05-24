// ============================================================================
// adt-client.mjs  —  Cliente compartido del data-plane de Azure Digital Twins
// ----------------------------------------------------------------------------
// Usa DefaultAzureCredential: resuelve automaticamente tus credenciales de
// `az login` (o variables de entorno / managed identity en produccion).
// No hay secretos en codigo.
// ============================================================================

import 'dotenv/config';
import { DigitalTwinsClient } from '@azure/digital-twins-core';
import { DefaultAzureCredential } from '@azure/identity';

export function getAdtClient() {
  const host = process.env.ADT_HOST_NAME;
  if (!host) {
    throw new Error(
      'Falta ADT_HOST_NAME en .env. Ejecuta primero scripts/01-provision-azure.ps1, ' +
      'que imprime el host (formato: <nombre>.api.<region>.digitaltwins.azure.net).'
    );
  }
  const url = host.startsWith('http') ? host : `https://${host}`;
  const credential = new DefaultAzureCredential();
  return new DigitalTwinsClient(url, credential);
}

// Helper: construye el cuerpo de un twin DTDL a partir de model + props
export function twinBody(modelId, props) {
  return { $metadata: { $model: modelId }, ...props };
}
