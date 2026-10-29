#!/bin/sh
# webmscore (partitioncloud fork, tag webmscore-4.6.5-1) for the browser, built from
# source with the system emscripten (/usr/lib/emscripten) and nothing else:
#   1. Qt 6.10.3 for wasm (qtbase + offscreen QPA, qtsvg, qt5compat, qtshadertools,
#      qtdeclarative) from the source tarballs into qt/6.10.3/wasm
#   2. webmscore's C++ (web/CMakeLists.txt) -> webmscore.lib.{js,wasm,data}
#   3. its JS wrapper (web-public, rollup) -> dist/, with the FluidR3Mono soundfont
# Upstream CI uses emsdk 3.1.14 + an aqt Qt 6.4.3 wasm_32 and drops in a prebuilt
# libqoffscreen.a; here every wasm object comes from this emcc.
# Host Qt 6.10.3 (moc, rcc, qsb, qmlcachegen...) comes from aqt into qt/6.10.3/gcc_64.
# Usage: ./build.sh  (log: build.log). Stages already done are skipped.
set -e
W=$(cd "$(dirname "$0")" && pwd)
exec >>"$W/build.log" 2>&1
echo "=== build.sh $(date -Is)"
QV=6.10.3
J=${J:-12}
Q=$W/qt/$QV
QW=$Q/wasm
QS=$W/qt-src
B=$W/qt-build
export QT_HOST_PATH=$Q/gcc_64

# One emscripten: the system one. Qt locates it through an emsdk layout, so
# emsdk-host/ is a pointer to /usr/lib/emscripten (as in fritzing-wasm)
mkdir -p $W/emsdk-host/upstream
ln -sfn /usr/lib/emscripten $W/emsdk-host/upstream/emscripten
echo "EMSCRIPTEN_ROOT = '/upstream/emscripten'" > $W/emsdk-host/.emscripten
export EMSDK=$W/emsdk-host PATH=$W/emsdk-host/upstream/emscripten:$PATH
emcc --version | head -1

# Host Qt tools
if [ ! -x $QT_HOST_PATH/bin/qsb ]; then
    $W/../fritzing-wasm/venv/bin/aqt install-qt linux desktop $QV linux_gcc_64 \
        -m qtshadertools qt5compat -O $W/qt
fi

# Qt sources
mkdir -p $W/dl $QS
for m in qtbase qtsvg qt5compat qtshadertools qtdeclarative; do
    t=$m-everywhere-src-$QV.tar.xz
    [ -f $W/dl/$t ] || curl -sSL -o $W/dl/$t https://download.qt.io/archive/qt/6.10/$QV/submodules/$t
    [ -d $QS/$m ] || { tar -C $QS -xJf $W/dl/$t && mv $QS/$m-everywhere-src-$QV $QS/$m; }
done
# webmscore runs a QGuiApplication on the "offscreen" platform; Qt leaves that
# plugin out of wasm builds, so let it in (upstream CI ships a prebuilt one instead)
sed -i 's/^if(QT_FEATURE_freetype AND NOT ANDROID AND NOT WASM)$/if(QT_FEATURE_freetype AND NOT ANDROID)/' \
    $QS/qtbase/src/plugins/platforms/CMakeLists.txt
# ...and that plugin is written for unix/windows: on wasm give it Qt's wasm event
# dispatcher (what QtCore itself uses there) and the FreeType font database
# (fonts from $QT_QPA_FONTDIR, which webmscore points at its preloaded /fonts)
# Qt's wasm timers call window.setTimeout; webmscore runs in a Web Worker, which has
# no window (webmscore's stand-in has no timers): use the global object
for p in qtbase-offscreen-wasm qtbase-wasm-worker-timers; do
    (cd $QS/qtbase && { patch -R -p1 -s -f --dry-run < $W/patches/$p.patch >/dev/null 2>&1 \
        || patch -p1 -N < $W/patches/$p.patch; })
done
# qmake reads "6.0.9-git" where CMake reads 6.0.9; drop the suffix as CMake does
F=mkspecs/features/wasm/emcc_ver.prf
grep -q 'section(E_VERSION, "-"' $QS/qtbase/$F || sed -i 's/^    return (\$\${E_VERSION})$/    return ($$section(E_VERSION, "-", 0, 0))/' $QS/qtbase/$F

# (rebuilt incrementally on every run, so that changed patches reach the install)
if [ ! -f $QW/lib/libQt6Gui.a ] || [ -f $B/qtbase/build.ninja ]; then
    mkdir -p $B/qtbase
    (cd $B/qtbase && { [ -f build.ninja ] || $QS/qtbase/configure -prefix $QW -qt-host-path $QT_HOST_PATH \
        -platform wasm-emscripten -release -static -no-warnings-are-errors \
        -nomake examples -nomake tests -- -DCMAKE_SUPPRESS_DEVELOPER_WARNINGS=ON; } \
        && cmake --build . --parallel $J && cmake --install .)
fi
for m in qtsvg qt5compat qtshadertools qtdeclarative; do
    case $m in
        qtsvg) probe=libQt6Svg.a ;; qt5compat) probe=libQt6Core5Compat.a ;;
        qtshadertools) probe=libQt6ShaderTools.a ;; qtdeclarative) probe=libQt6Quick.a ;;
    esac
    if [ ! -f $QW/lib/$probe ]; then
        rm -rf $B/$m && mkdir -p $B/$m
        (cd $B/$m && $QW/bin/qt-configure-module $QS/$m && cmake --build . --parallel $J && cmake --install .)
    fi
done
ls -la $QW/plugins/platforms/
echo "=== Qt done $(date -Is)"

# webmscore: partitioncloud/webmscore at tag webmscore-4.6.5-1, with its submodules
M=$W/src
if [ ! -d $M/.git ]; then
    git clone --depth 1 --branch webmscore-4.6.5-1 https://github.com/partitioncloud/webmscore $M
fi
(cd $M && git submodule update --init --depth 1)
# Adapt it to this emscripten and Qt (see the patch header)
(cd $M && { git apply --reverse --check $W/patches/webmscore-emscripten6.patch 2>/dev/null \
    || git apply $W/patches/webmscore-emscripten6.patch; })

MB=$W/build
mkdir -p $MB
(cd $MB && [ -f build.ninja ] || emcmake cmake -G Ninja $M/web -DCMAKE_BUILD_TYPE=RELEASE \
    -DCMAKE_PREFIX_PATH=$QW -DCMAKE_TOOLCHAIN_FILE=$QW/lib/cmake/Qt6/qt.toolchain.cmake \
    -DQT_HOST_PATH=$QT_HOST_PATH -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_BUILD_NUMBER=$(cd $M && git rev-parse --short=7 HEAD))
cmake --build $MB --parallel $J
ls -la $MB/webmscore.lib.*

# The JS wrapper (worker + glue) around this build's webmscore.lib.js
P=$M/web-public
cp $MB/webmscore.lib.js $MB/webmscore.lib.wasm $MB/webmscore.lib.data $P/
[ ! -f $MB/webmscore.lib.js.symbols ] || cp $MB/webmscore.lib.js.symbols $P/webmscore.lib.symbols
(cd $P && [ -d node_modules/rollup ] || npm install --no-audit --no-fund)
(cd $P && npx rollup -c)

# dist/: what /webmscore/ serves
D=$W/dist
mkdir -p $D
cp $P/webmscore.mjs $P/webmscore.js $P/webmscore.lib.js $P/webmscore.lib.wasm $P/webmscore.lib.data $D/
[ -f $W/dl/FluidR3Mono_GM.sf3 ] || curl -sSL -o $W/dl/FluidR3Mono_GM.sf3 \
    https://cdn.jsdelivr.net/gh/musescore/MuseScore@2.1/share/sound/FluidR3Mono_GM.sf3
cp $W/dl/FluidR3Mono_GM.sf3 $D/
(cd $D && sha256sum webmscore.lib.wasm webmscore.lib.data webmscore.lib.js webmscore.mjs FluidR3Mono_GM.sf3 > SHA256SUMS)
ls -la $D
echo "=== done $(date -Is)"
