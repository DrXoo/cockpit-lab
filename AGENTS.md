# Trabajar en Cockpit Lab

- Lee `README.md` y `docs/mini-cad.md` antes de cambiar la arquitectura.
- Conserva la funcionalidad del configurador existente durante la evolución del CAD. Separa migraciones, refactorizaciones y nuevas funciones en cambios revisables.
- La versión actual sirve directamente `dist/`. No la trates como una carpeta regenerable ni la elimines durante un build.
- Usa `npm run dev`, `npm run check` y `npm test`. Los cambios visuales o de interacción requieren comprobación en navegador.
- Los JSON actuales usan versión 1 y medidas en cm; el futuro modelo CAD usará mm con un esquema versionado y un adaptador explícito. Conserva la importación de archivos anteriores.
- En el sistema actual, +Y es arriba, +Z es el frente del cockpit y −X es la derecha del piloto. Haz explícitas las conversiones si introduces otro convenio.
- Las cantidades y cotas del CAD deben proceder del modelo de piezas y uniones. No las deduzcas de las mallas dibujadas ni de multiplicadores orientativos.
- Guarda por separado la envolvente de un periférico, sus puntos de montaje y la procedencia de sus medidas. No escales los taladros al redimensionar una carcasa.
- Distingue una colisión intencionada de contacto/apoyo de una interferencia. Documenta las tolerancias utilizadas.
- Mantén información textual y símbolos para los estados; el color por sí solo no basta.
- Conserva las licencias de `dist/vendor/`. No incluyas credenciales, archivos personales, configuración local de Sites ni capturas privadas en el repositorio público.
- La documentación y la interfaz se escriben en español. Usa nombres claros y módulos pequeños en el código nuevo.
