"""Export the user's outlined, single-colour PDF-compatible AI logos as SVG paths.

Original Illustrator files stay unchanged. No font substitution or image tracing.
Requires pypdf; the Codex bundled Python runtime provides it.
"""
from pathlib import Path
from pypdf import PdfReader
from pypdf.generic import ContentStream

ROOT = Path(__file__).resolve().parent.parent


def multiply(a, b):
    a0,a1,a2,a3,a4,a5 = a
    b0,b1,b2,b3,b4,b5 = b
    return (a0*b0+a2*b1, a1*b0+a3*b1, a0*b2+a2*b3,
            a1*b2+a3*b3, a0*b4+a2*b5+a4, a1*b4+a3*b5+a5)


def export(source, stem):
    reader = PdfReader(source)
    page = reader.pages[0]
    height = float(page.mediabox.height)
    matrix = (1,0,0,1,0,0)
    stack, paths, commands, points = [], [], [], []
    current = (0,0)

    def point(x,y):
        a,b,c,d,e,f = matrix
        xy = (a*x+c*y+e, height-(b*x+d*y+f))
        points.append(xy)
        return f'{xy[0]:.4f} {xy[1]:.4f}'

    for arguments, operator in ContentStream(page.get_contents(), reader).operations:
        op = operator.decode()
        if op in {'m','l','c','v','y','re','cm'}:
            numbers = [float(n) for n in arguments]
        if op == 'q': stack.append(matrix)
        elif op == 'Q': matrix = stack.pop()
        elif op == 'cm': matrix = multiply(matrix, numbers)
        elif op == 'm':
            current = tuple(numbers); commands.append('M'+point(*current))
        elif op == 'l':
            current = tuple(numbers); commands.append('L'+point(*current))
        elif op == 'c':
            commands.append('C'+' '.join(point(*numbers[i:i+2]) for i in (0,2,4)))
            current = tuple(numbers[4:6])
        elif op == 'v':
            commands.append('C'+point(*current)+' '+point(*numbers[:2])+' '+point(*numbers[2:4]))
            current = tuple(numbers[2:4])
        elif op == 'y':
            commands.append('C'+point(*numbers[:2])+' '+point(*numbers[2:4])+' '+point(*numbers[2:4]))
            current = tuple(numbers[2:4])
        elif op == 're':
            x,y,w,h = numbers
            commands.extend(['M'+point(x,y),'L'+point(x+w,y),'L'+point(x+w,y+h),'L'+point(x,y+h),'Z'])
        elif op == 'h': commands.append('Z')
        elif op in {'f','f*'}:
            paths.append((' '.join(commands), list(points), 'evenodd' if op=='f*' else 'nonzero'))
            commands,points = [],[]
        elif op == 'n': commands,points = [],[]
        elif op == 'scn':
            if list(arguments) != [0,0,0,0.8]:
                raise ValueError('Unexpected logo palette; inspect before exporting.')
        elif op not in {'BDC','EMC','W','cs','ri','gs'}:
            raise ValueError(f'Unsupported PDF graphics operation: {op}')

    coordinates = [xy for _, pts, _ in paths for xy in pts]
    x0,y0 = map(min,zip(*coordinates)); x1,y1 = map(max,zip(*coordinates))
    padding = 4
    viewbox = f'{x0-padding:.4f} {y0-padding:.4f} {x1-x0+padding*2:.4f} {y1-y0+padding*2:.4f}'
    for variant, colour in [('', '#595757'), ('-light', '#edf3ee')]:
        body = '\n'.join(f'  <path d="{d}" fill-rule="{rule}"/>' for d,_,rule in paths)
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" fill="{colour}">\n{body}\n</svg>\n'
        (ROOT/'public/brand'/f'{stem}{variant}.svg').write_text(svg)
    print(f'{source.name}: {len(paths)} outlined paths; exported original and light variants.')


if __name__ == '__main__':
    export(ROOT/'素材/ロゴ/てんこう２.ai', 'tenkoh2-ja')
    export(ROOT/'素材/ロゴ/TEN-KOH2.ai', 'tenkoh2-en')

    export(ROOT/'素材/ロゴ/1COSMIC.ai', 'nucc-horizontal')
    export(ROOT/'素材/ロゴ/3COSMIC.ai', 'nucc-stacked')
