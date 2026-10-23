"""Package the complete static website using its recorded release version."""
import argparse
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def main():
    project = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=project.parent)
    args = parser.parse_args()
    root = project / 'dist' if (project / 'dist').is_dir() else project
    if not (root / 'release.json').is_file():
        raise SystemExit('Run this helper from the source checkout or an extracted website release.')
    release = json.loads((root / 'release.json').read_text())
    version = release['version']
    if not re.fullmatch(r'1\.[1-9]\d*', version):
        raise SystemExit('Release version must be 1.<release number>.')
    if int(version.split('.')[1]) != release['release_number']:
        raise SystemExit('Version and release number must agree.')
    name = f'COPKU_Website_v{version}'
    if release['zip_filename'] != name + '.zip' or release['zip_root'] != name:
        raise SystemExit('Release filenames must contain the recorded version.')
    destination = args.output_dir.resolve()
    if destination.is_relative_to(root):
        raise SystemExit('Write the ZIP outside dist so it cannot include itself.')
    destination.mkdir(parents=True, exist_ok=True)
    output = destination / release['zip_filename']
    files = sorted(path for path in root.rglob('*') if path.is_file())
    entries = {name + '/' + path.relative_to(root).as_posix(): path for path in files}
    # Include the same helper in the downloadable release so it can be repackaged.
    entries[name + '/tools/package_release.py'] = Path(__file__).resolve()

    def verify(path):
        with ZipFile(path) as archive:
            if archive.testzip() is not None or set(archive.namelist()) != set(entries):
                raise ValueError('ZIP contents do not match this release.')
            for entry, source in entries.items():
                if archive.read(entry) != source.read_bytes():
                    raise ValueError('ZIP contents do not match this release.')

    if output.exists():
        try:
            verify(output)
        except (ValueError, OSError) as error:
            raise SystemExit('This numbered ZIP already exists with different content. Increment the release version before packaging.') from error
    else:
        temporary = output.with_suffix('.zip.part')
        try:
            with ZipFile(temporary, 'w', ZIP_DEFLATED) as archive:
                for entry, source in entries.items():
                    archive.write(source, entry)
            verify(temporary)
            temporary.replace(output)
        finally:
            temporary.unlink(missing_ok=True)
    print(json.dumps({'version': version, 'archive': str(output), 'files': len(entries), 'bytes': output.stat().st_size}))


if __name__ == '__main__':
    main()
