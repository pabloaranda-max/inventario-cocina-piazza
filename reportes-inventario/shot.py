from playwright.sync_api import sync_playwright
import sys
src, out, theme, w = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': w, 'height': 1400},
                    color_scheme='dark' if theme == 'dark' else 'light')
    pg.goto('file://' + src)
    pg.wait_for_timeout(1200)
    # detectar desbordes horizontales
    over = pg.evaluate("""() => {
      const bad=[]; const de=document.documentElement;
      if (de.scrollWidth > de.clientWidth+1) bad.push('BODY scrollWidth '+de.scrollWidth+' > '+de.clientWidth);
      document.querySelectorAll('*').forEach(e=>{
        const r=e.getBoundingClientRect();
        if(r.right > de.clientWidth+2 && getComputedStyle(e).overflowX!=='auto')
          bad.push(e.tagName+'.'+(e.className||'').toString().slice(0,30)+' right='+Math.round(r.right));
      });
      return bad.slice(0,8);
    }""")
    print(theme, w, 'overflow:', over if over else 'ninguno')
    print('  font cargada:', pg.evaluate("document.fonts.check('16px FreightNeo')"))
    pg.screenshot(path=out, full_page=True)
    b.close()
