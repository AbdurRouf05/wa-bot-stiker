"""PDF -> DOCX (dipanggil dari commands/todocx.js).

Pemakaian: python3 pdf2docx_convert.py input.pdf output.docx
Diadaptasi dari engine SuperTools (supertools/tools/convert/engines/pdf2docx.py).
"""
import logging
import sys
import warnings

warnings.filterwarnings("ignore")
logging.disable(logging.CRITICAL)


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: pdf2docx_convert.py input.pdf output.docx", file=sys.stderr)
        return 2
    from pdf2docx import Converter

    src, dst = sys.argv[1], sys.argv[2]
    cv = Converter(src)
    try:
        if cv.fitz_doc.needs_pass:
            print("PDF terkunci password", file=sys.stderr)
            return 3
        cv.convert(dst, multi_processing=False)
    finally:
        cv.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
