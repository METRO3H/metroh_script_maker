#!/usr/bin/env python3
"""
Divide un diccionario de palabras (ordenado de más a menos frecuente) en dos
archivos para que el editor pueda empezar a sugerir enseguida:

  <nombre>.txt        las N palabras más frecuentes (nivel 1, se carga primero)
  <nombre>.rest.txt   el resto (nivel 2, se carga después, en segundo plano)

El puntaje de cada palabra depende de su posición en la lista completa. Por eso
el segundo archivo lleva al principio la línea `#rank_offset=N`: el motor la lee
y sigue contando desde ahí, así que el resultado es idéntico a cargar un solo
archivo grande.

Uso (después de build_spanish_words.py, que genera el archivo completo):

  python3 scripts/split_words.py src/assets/words/es.txt
  python3 scripts/split_words.py src/assets/words/en.txt --top 30000

Si el archivo ya está dividido (tiene N palabras o menos) no hace nada, así que
es seguro volver a ejecutarlo.
"""
import argparse
import pathlib
import sys


def split_lines(lines, top):
    """Devuelve (cabecera, palabras_nivel_1, palabras_resto)."""
    header, words = [], []
    for raw in lines:
        line = raw.rstrip("\r\n")
        stripped = line.strip()
        if not stripped:
            if not words:
                header.append(line)
            continue
        if stripped.startswith("#"):
            if not words:
                header.append(line)
            continue
        words.append(stripped)
    return header, words[:top], words[top:]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("path", help="archivo completo, p. ej. src/assets/words/es.txt")
    ap.add_argument("--top", type=int, default=30000, help="palabras del nivel 1 (por defecto 30000)")
    args = ap.parse_args()

    path = pathlib.Path(args.path)
    header, first, rest = split_lines(path.read_text(encoding="utf-8").splitlines(), args.top)
    if not rest:
        print(f"{path}: {len(first)} palabras, nada que dividir.")
        return 0

    rest_path = path.with_name(path.stem + ".rest.txt")
    head = "\n".join(h for h in header).rstrip("\n")
    path.write_text(
        head + "\n#\n"
        f"# NIVEL 1: las {len(first)} palabras más frecuentes. El resto está en {rest_path.name}\n"
        "# (generado con scripts/split_words.py; no editar a mano).\n\n"
        + "\n".join(first) + "\n",
        encoding="utf-8",
    )
    rest_path.write_text(
        f"# Continuación de {path.name}: palabras de la posición {len(first) + 1} en adelante.\n"
        "# Generado con scripts/split_words.py; no editar a mano.\n"
        "# La línea siguiente le dice al motor desde qué posición seguir contando\n"
        "# (el puntaje de una palabra depende de su posición en la lista completa).\n"
        f"#rank_offset={len(first)}\n\n"
        + "\n".join(rest) + "\n",
        encoding="utf-8",
    )
    print(f"{path}: {len(first)} palabras\n{rest_path}: {len(rest)} palabras (rank_offset={len(first)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
