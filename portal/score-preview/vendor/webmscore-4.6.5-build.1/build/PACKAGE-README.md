# @kreijstal/webmscore-wasm

webmscore (MuseScore 4.6.5 engine) for the browser: renders and converts MuseScore, MusicXML and MIDI scores

Upstream: https://github.com/LibreScore/webmscore

## Use

Pinned to this version, from a CDN:

    https://cdn.jsdelivr.net/npm/@kreijstal/webmscore-wasm@4.6.5-build.1/<file>
    https://unpkg.com/@kreijstal/webmscore-wasm@4.6.5-build.1/<file>

## Reproducing this build

Everything here is built from source; nothing prebuilt is repackaged. The script that produced these files is included as `build/build.sh`, with the patches it applies in `build/patches/`.

### Toolchain

- emscripten: `emcc 6.0.9-git (4e4223852a0835923411059a3929907d7df1232e)` from the Arch Linux package `emscripten 6.0.9-1`
  (installed at /usr/lib/emscripten; LLVM `clang version 24.0.0git`, Binaryen `wasm-opt version 132 (version_132-49-gd03c25ea43)`)
- Node.js v22.23.2, CMake 4.4.3, Arch Linux
- No emsdk: the script puts /usr/lib/emscripten first on PATH and unsets EMSDK/EM_CONFIG,
  so every object (including emscripten's own libc/libc++) comes from that one emcc
- Host Qt 6.10.3 tools (moc, rcc, qsb, qmlcachegen) installed by aqtinstall; they run on the build machine and emit no wasm. Qt finds emscripten through `emsdk-host/`, a pointer to /usr/lib/emscripten made by the script

### Sources

| Source | Pin |
|---|---|
| [partitioncloud/webmscore](https://github.com/partitioncloud/webmscore) | tag `webmscore-4.6.5-1` (commit `c54bb4366a880ec8757c1d8efaa8c660f476c2c3`) |
| Qt (qtbase, qtsvg, qt5compat, qtshadertools, qtdeclarative) | 6.10.3 source tarballs from download.qt.io/archive |
| FluidR3Mono_GM.sf3 (soundfont, data) | MuseScore 2.1 |

`build/patches/`: Qt's offscreen platform and worker timers for wasm, and webmscore fixes for emscripten 6.

### Steps

On Arch Linux with the `emscripten` package installed (`pacman -S emscripten`):

    mkdir webmscore-wasm && cd webmscore-wasm && cp /path/to/this/package/build/* .
    ./build.sh

 The script fetches the pinned sources itself and refuses to run with any emcc other than /usr/lib/emscripten/emcc; the output lands in `dist/`. Compare it against the checksums below.

The comment at the top of the build script, verbatim:

    webmscore (partitioncloud fork, tag webmscore-4.6.5-1) for the browser, built from
    source with the system emscripten (/usr/lib/emscripten) and nothing else:
      1. Qt 6.10.3 for wasm (qtbase + offscreen QPA, qtsvg, qt5compat, qtshadertools,
         qtdeclarative) from the source tarballs into qt/6.10.3/wasm
      2. webmscore's C++ (web/CMakeLists.txt) -> webmscore.lib.{js,wasm,data}
      3. its JS wrapper (web-public, rollup) -> dist/, with the FluidR3Mono soundfont
    Upstream CI uses emsdk 3.1.14 + an aqt Qt 6.4.3 wasm_32 and drops in a prebuilt
    libqoffscreen.a; here every wasm object comes from this emcc.
    Host Qt 6.10.3 (moc, rcc, qsb, qmlcachegen...) comes from aqt into qt/6.10.3/gcc_64.
    Usage: ./build.sh  (log: build.log). Stages already done are skipped.

### Checksums of the published files

```
cfcd66d89e8386823400eca64934b14fbea7bf48ba1f00d21189af1262794ec2  FluidR3Mono_GM.sf3
ad95dff1e697e46384175bff6534b4d87ab7e5fdae32338aefc822cb14909872  SHA256SUMS
641cf8d1e052ca9d7993bffa1c57925c47fdfb49bfe646bdfad2ed3cc94e1855  webmscore.js
68e82855c7e644e994c69754f66340baaf160630a5875c37500d6e8532b169d6  webmscore.lib.data
2ba26fdbec9522f5360bf5b1056c9e28b7ee57ff505013b478c8a5b29e8fb5ff  webmscore.lib.js
8a5d7e4fde704265cd150f08d9555c2f51afccd37311f569743289997a2a3d71  webmscore.lib.wasm
5b26e9a2b120ce7774b84e59269b5aa3b396679b80d8efa5fc37563ba7c16b85  webmscore.mjs
```

## Licenses

`GPL-3.0-only`. The license texts of everything compiled in are in `LICENSES/`.
