# Lokinvas

Editor visual de imágenes y textos con canvas libre, hecho con React, TypeScript y Vite.

## Ejecutar

```sh
npm install
npm run dev
```

Abre la dirección que imprime Vite (normalmente http://127.0.0.1:5173).

## Funciones

- Importar múltiples imágenes con el botón o arrastrándolas al canvas.
- Añadir texto con la herramienta T: actívala y haz clic en el canvas. Edita con doble clic; Ctrl/⌘ + Enter termina la edición, Escape la cancela y Enter añade otra línea. También puedes editar contenido, fuente y color en Propiedades.
- Mover y redimensionar textos con los mismos controles y guías de las imágenes. Las esquinas escalan las letras; sin proporción bloqueada, cambiar el ancho permite redistribuir las líneas dentro de la caja.
- Seleccionar, mover, redimensionar, duplicar y eliminar imágenes.
- Seleccionar varios elementos con Shift + clic (canvas o capas), arrastrando un marco desde una zona vacía o con Ctrl/⌘ + A. Arrastra uno de los seleccionados para mover el conjunto; también puedes usar flechas. Las guías toman el contorno del conjunto y mantienen las posiciones relativas. Cada movimiento conjunto es un único paso de historial. Las capas bloqueadas u ocultas no se mueven y no se incluyen en la selección por marco.
- Redimensionar todos los seleccionados desde las esquinas del marco o con Ancho/Alto del conjunto en Propiedades. Con proporción bloqueada, tamaños, separaciones y letras escalan juntos; puedes desbloquear la proporción para ajustar cada eje. Incluye guías, Alt para desactivar el ajuste, cancelación con Escape y un único paso de deshacer. Desbloquea y muestra todas las capas de la selección para habilitar el tamaño conjunto. Los límites de tamaño se aplican a cada elemento.
- Conservar la proporción o ajustar libremente el tamaño.
- Guías magenta al redimensionar: igualar ancho/alto y alinear el borde con otras imágenes visibles. Ajuste automático a seis píxeles de pantalla; mantén Alt al arrastrar para desactivarlo.
- Guías al mover: alinear bordes y centros con otras imágenes visibles, con la misma tolerancia de ajuste y Alt para mover libremente.
- Modificar posición y tamaño con valores numéricos.
- Cambiar el orden con botones o arrastrando las capas; ocultar y bloquear capas.
- Zoom con rueda o botones; desplazamiento con la mano, botón central o espacio + arrastrar.
- Deshacer y rehacer, hasta 50 cambios.
- Guardado automático en IndexedDB, incluyendo las imágenes.
- Exportar canvas: el botón de la barra superior descarga un archivo `.lokinvas` con imágenes completas, textos, posiciones, tamaños, colores, orden de capas, bloqueo/visibilidad y la vista actual. Funciona sin servidor y no depende del guardado local. El archivo usa JSON UTF-8 con identificador y versión del formato; no incluye el historial ni la selección. Esta versión permite exportar; la apertura de archivos de proyecto aún no está implementada.
- Los documentos anteriores se migran automáticamente, conservando las imágenes y su orden.
- Ejemplo incluido, disponible sin servicios externos.

El trabajo se guarda en el navegador y origen usados. Cambiar de navegador, de puerto o borrar los datos del sitio crea un espacio independiente. Es un MVP de escritorio: en pantallas pequeñas se ocultan los paneles laterales. No incluye colaboración, cuentas ni sincronización entre dispositivos. Las imágenes GIF se muestran con su animación, pero no se editan sus fotogramas. El límite por archivo es 25 MB; la capacidad total depende del almacenamiento del navegador.

## Verificación

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Las pruebas de navegador también pueden usar Chrome o Edge ya instalado, indicando su ruta en `PLAYWRIGHT_EXECUTABLE_PATH`.

En PowerShell, por ejemplo:

```powershell
$env:PLAYWRIGHT_EXECUTABLE_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
npm run test:e2e
```

La suite comprueba importación, arrastre con zoom, redimensionamiento, capas, historial, errores, atajos y recuperación tras recargar.
