import fitz
text = ("The merchant's reluctance to invest was palpable. Economists argue that the policy "
"could exacerbate inflation, yet many remain ambivalent about its ramifications.")
# A: bold words
d=fitz.open(); p=d.new_page()
html="<p style='font-size:14pt'>The merchant's <b>reluctance</b> to invest was <b>palpable</b>. Economists argue that the policy could <b>exacerbate</b> inflation, yet many remain ambivalent.</p>"
p.insert_htmlbox(fitz.Rect(50,50,500,300),html); d.save('/home/user/testpdf/bold.pdf')
# B: highlight annotation
d=fitz.open(); p=d.new_page()
p.insert_textbox(fitz.Rect(50,50,500,300),text,fontsize=14)
for w in ("reluctance","palpable","exacerbate"):
    for r in p.search_for(w): p.add_highlight_annot(r)
d.save('/home/user/testpdf/annot.pdf')
# C: drawn yellow rectangle behind text (e.g. printed from Word/browser)
d=fitz.open(); p=d.new_page()
for w in ("reluctance","palpable"):
    pass
p.insert_textbox(fitz.Rect(50,50,500,300),text,fontsize=14)
for w in ("ambivalent","ramifications"):
    for r in p.search_for(w): p.draw_rect(r,color=None,fill=(1,1,0.2),overlay=False)
p.insert_textbox(fitz.Rect(50,50,500,300),text,fontsize=14)  # text over rects
d.save('/home/user/testpdf/rect.pdf')
