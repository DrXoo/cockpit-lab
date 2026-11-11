# Creación progresiva del espacio

Un proyecto nuevo empieza sin habitación confirmada, mesa, cockpit ni accesorios. La primera pantalla pide ancho y fondo interiores, en cm. La altura inicial de 250 cm se identifica como referencia editable. No se dibuja la habitación hasta confirmar sus medidas.

El recorrido tiene cinco pasos: habitación, puertas y ventanas, muebles existentes, mesa y cockpit. Se puede volver a los pasos visitados conservando los objetos y sus posiciones. «Añadir después» registra un paso pendiente; «No necesito mesa» permite continuar sin escritorio. Las bases GT, vuelo, híbrido y espacio mínimo se ofrecen al añadir el cockpit. Sus ajustes conservan habitación, muebles y mesa.

Las dimensiones de una mesa se introducen antes de añadirla. Monitor y brazo, teclado, PC, ratón y alfombrilla se activan individualmente. Se conservan los límites del configurador actual: tablero de 120–200 × 60–80 cm, altura de 66–131 cm y pies de referencia de 66 cm de fondo. Esto no es un catálogo de mesas reales.

Al activar el monitor, el paso Mesa muestra siempre «Llevar al cockpit» y «Llevar al escritorio», independientemente del elemento seleccionado. El primer botón permanece desactivado hasta añadir el cockpit. Ambos accesos se conservan en el editor completo.

En el paso 4, el selector «Elemento a mover» permite elegir el escritorio completo o cualquiera de sus accesorios activos. Seleccionar desde el menú activa el arrastre y abre la vista Mesa para los accesorios. También se pueden seleccionar y arrastrar directamente en las vistas Mesa y Planta; los objetos tienen prioridad sobre la alfombrilla y el tablero. El panel muestra las coordenadas locales del accesorio y su giro. El anclaje conserva las restricciones de su fijación; «Mover monitor y brazo» permite arrastrar CODO o VESA y ajustar sus giros. Los accesorios conservan su tamaño y se mantienen dentro del tablero cuando caben.

Los muebles de suelo, la mesa y el cockpit nuevos se colocan inicialmente en el centro de la habitación para que el usuario los distribuya; esa posición no se presenta como una solución válida. Las estanterías de pared comienzan centradas en la pared AB, con la base a 140 cm del suelo, como referencia editable. Las interferencias se recalculan al arrastrar o introducir coordenadas. Se puede terminar un proyecto con avisos, que permanecen visibles.

Al terminar se accede al editor libre, organizado como Habitación, Muebles, Mesa y Cockpit. La postura se ajusta dentro del cockpit. En pantallas estrechas se alterna entre Diseño, Ajustes y Comprobaciones. La página ocupa la ventana; los controles largos se desplazan dentro de su panel.

## Estanterías de pared

En Muebles se puede añadir una «Estantería de pared», además de las estanterías apoyadas en el suelo. Se eligen pared de anclaje, distancia desde su esquina inicial, ancho, fondo, altura del mueble y altura de la base desde el suelo. Arrastrar en planta desplaza la estantería a lo largo de su pared; el selector permite cambiarla de pared. En planta, la etiqueta identifica el montaje en pared y la altura de la base. La vista 3D muestra el espacio que queda debajo.

Las comprobaciones usan la envolvente completa desde la base hasta la parte superior. Un mueble puede quedar debajo si no se cruzan sus intervalos de altura. Se mantiene la tolerancia de 0,15 cm en planta y 0,1 cm en altura para interferencias entre muebles y con el conjunto; el contacto entre envolventes no genera interferencia. El apoyo trasero en la pared es intencionado. Se comprueban los límites de la habitación y el techo con la altura total instalada. Anclar sobre un hueco de puerta o ventana genera un error si se solapan más de 0,1 cm tanto a lo largo de la pared como en altura, incluso con la reserva de ventana desactivada. Las estanterías que quedan completamente por encima o por debajo de una ventana no ocupan su reserva de apertura; los muebles de suelo mantienen la reserva de acceso anterior. No se calculan cargas, resistencia del muro, fijaciones ni contenido de los estantes.

El JSON v2 en cm conserva `type: "wallShelf"`, `mountWall`, `offset` y `elevation` en `roomFurniture`. Posición y giro se derivan explícitamente de la pared y las dimensiones al normalizar el proyecto. Los tipos anteriores siguen apoyados en el suelo y la importación v1 se conserva.

## Acceso a armario empotrado

En el paso Muebles, «Armario empotrado» añade únicamente un frente de puertas correderas en la pared y una franja que debe quedar libre delante. Se indican pared, inicio desde su esquina, ancho total y altura de puertas desde el suelo, y espacio libre delante. La reserva inicial de 80 cm es una referencia editable. La altura inicial coincide con el techo y puede ajustarse a la medida real de las puertas. No se pide fondo interior, distribución ni número de hojas. La representación de las hojas es un símbolo de correderas sin barrido de apertura.

El frente se arrastra a lo largo de la pared. La reserva se extiende hacia dentro de la habitación y se comprueba desde el suelo hasta la altura de las puertas. Una estantería completamente por encima queda fuera del frente y de su reserva. Un mueble, mesa, cockpit o accesorio que invada más de 0,15 cm en planta y 0,1 cm en altura produce un aviso «Acceso ocupado»; no se considera una interferencia con un cuerpo de armario. También se avisa si la franja sale de la habitación o si se desactiva con 0 cm. No se comprueba una ruta continua hasta el armario ni se impide guardar una distribución con avisos.

El JSON v2 en cm conserva el frente en `roomFeatures` con `type: "wardrobeAccess"`, `wall`, `offset`, `width`, `height` y `clearance`; no existe un volumen interior. Las alturas guardadas se conservan al cambiar el techo; si lo superan se ajustan al nuevo techo. Los accesos sin altura recuperan la del techo como referencia editable. El menú lo muestra en Muebles aunque sus coordenadas sean relativas a una pared. Se detectan solapes con otros huecos y estanterías ancladas sobre el frente. La importación de proyectos anteriores se mantiene.

## Modelo y guardado

La presencia de mesa, cockpit y cada accesorio es parte de la configuración, independiente de la visibilidad de una malla. Los elementos ausentes no participan en envolventes, interferencias, ergonomía, cantidades ni resumen. Los valores numéricos conservados para futuras adiciones no significan que el elemento exista.

Los proyectos nuevos se guardan como JSON **versión 2, unidades `cm`**. Esta versión incorpora presencia de elementos y progreso de creación (`setup`: paso actual, último paso accesible, pasos pendientes y borradores de formularios). Las medidas en borrador se recuperan al volver, pero no crean objetos hasta confirmarlas. No es el futuro esquema CAD en mm descrito en `mini-cad.md`. Los cortes del configurador siguen expresándose en mm y siendo orientativos.

`project.js` adapta explícitamente los archivos v1: conserva sus medidas y posiciones y considera presentes la mesa, el cockpit y los accesorios que aquella versión creaba siempre. Los abre directamente en el editor completo. El almacenamiento nuevo usa `cockpit-lab-v2`; si no existe, se recupera `cockpit-lab-v1` sin borrarlo. Un archivo v2 reanuda su paso actual. Las unidades o versiones desconocidas se rechazan.

## Comprobación

`tests/project.test.mjs` verifica proyectos vacíos, ausencia de interferencias y despiece fantasma, mesa sin accesorios, cockpit sin mesa, recuperación del progreso, adaptación v1 y rechazo de datos incoherentes. Las pruebas anteriores conservan la cobertura del configurador completo. La comprobación en navegador incluye el recorrido completo, arrastre de muebles y cockpit, guardado y reanudación.

Las tolerancias de colisión se conservan: los volúmenes del conjunto exigen solape vertical y horizontal superior a 0,1 cm; los muebles emplean 0,15 cm en planta y 0,1 cm en altura. Los apoyos intencionados de objetos sobre el tablero y de objetos sobre la alfombrilla se tratan por separado. No se calcula resistencia ni una ruta de acceso continua.
