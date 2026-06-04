# -*- coding: utf-8 -*-
"""Gera o relatorio executivo (PDF) do trabalho feito na plataforma JurisAI."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak, ListFlowable, ListItem
)

GOLD = colors.HexColor("#B8902F")
GOLD_LIGHT = colors.HexColor("#EAB308")
DARK = colors.HexColor("#1a1a24")
GREY = colors.HexColor("#6b6b7a")
BG_SOFT = colors.HexColor("#faf6ec")

OUT = r"C:\Users\Infosol\Downloads\Relatorio_JurisAI.pdf"

styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=15, textColor=GOLD, spaceBefore=14, spaceAfter=6)
H2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=11.5, textColor=DARK, spaceBefore=10, spaceAfter=3)
BODY = ParagraphStyle("Body", parent=styles["Normal"], fontName="Helvetica", fontSize=9.5, leading=14, alignment=TA_JUSTIFY, textColor=colors.HexColor("#23232e"))
BULLET = ParagraphStyle("Bullet", parent=BODY, leftIndent=4, spaceAfter=2)
SMALL = ParagraphStyle("Small", parent=BODY, fontSize=8.2, textColor=GREY)
CAPTION = ParagraphStyle("Cap", parent=styles["Normal"], fontName="Helvetica-Oblique", fontSize=8.5, textColor=GREY, alignment=TA_CENTER)
TITLE = ParagraphStyle("Title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=26, textColor=GOLD, spaceAfter=4)
SUB = ParagraphStyle("Sub", parent=styles["Normal"], fontName="Helvetica", fontSize=12, textColor=GREY, alignment=TA_CENTER)

story = []

def hr():
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=0.7, color=colors.HexColor("#e0d6b8")))
    story.append(Spacer(1, 6))

def bullets(items):
    story.append(ListFlowable(
        [ListItem(Paragraph(t, BULLET), leftIndent=10, value="•") for t in items],
        bulletType="bullet", bulletColor=GOLD, start="•",
    ))
    story.append(Spacer(1, 4))

# ───────────────── CAPA ─────────────────
story.append(Spacer(1, 60))
story.append(Paragraph("JurisAI", TITLE))
story.append(Paragraph("Relatório de Implementação da Plataforma", SUB))
story.append(Spacer(1, 8))
story.append(Paragraph("Bacellar Advogados &middot; LexForce", SUB))
story.append(Spacer(1, 30))
story.append(HRFlowable(width="60%", thickness=1.2, color=GOLD, hAlign="CENTER"))
story.append(Spacer(1, 16))
story.append(Paragraph("Documento técnico-executivo das funcionalidades entregues, "
                       "correções aplicadas e arquitetura de orquestração multi-agente.",
                       ParagraphStyle("c", parent=BODY, alignment=TA_CENTER, fontSize=10, textColor=GREY)))
story.append(Spacer(1, 40))

cover_tbl = Table([
    ["Sistema", "JurisAI — plataforma jurídica multi-agente (uso interno)"],
    ["Escopo", "Aba Markdown, gestão de acessos, listagem de agentes, biblioteca de modelos, orquestração N1→N2→N3"],
    ["Stack", "React + TypeScript + Vite · Supabase (Postgres/RLS/Edge Functions) · OpenAI"],
    ["Patches", "V22 (biblioteca de modelos) e V23 (orquestração multi-agente)"],
], colWidths=[32*mm, 120*mm])
cover_tbl.setStyle(TableStyle([
    ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
    ("FONTNAME", (1,0), (1,-1), "Helvetica"),
    ("FONTSIZE", (0,0), (-1,-1), 9),
    ("TEXTCOLOR", (0,0), (0,-1), GOLD),
    ("TEXTCOLOR", (1,0), (1,-1), DARK),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ("LINEBELOW", (0,0), (-1,-2), 0.4, colors.HexColor("#e8e0c8")),
]))
story.append(cover_tbl)
story.append(PageBreak())

# ───────────────── RESUMO EXECUTIVO ─────────────────
story.append(Paragraph("1. Resumo Executivo", H1))
hr()
story.append(Paragraph(
    "Este relatório consolida o trabalho realizado na plataforma JurisAI. As entregas se dividem em "
    "<b>novas funcionalidades</b> (memória de documentos por agente, biblioteca de modelos de petição, "
    "anexos no chat e a orquestração multi-agente), <b>ajustes de gestão</b> (criação de acessos, convites, "
    "visibilidade de telas, listagem de agentes) e um conjunto de <b>correções críticas</b> que faziam os "
    "agentes não responderem.", BODY))
story.append(Spacer(1, 6))
story.append(Paragraph(
    "O marco principal foi transformar o chat — que era de agente único e travava — em uma "
    "<b>cadeia hierárquica N1→N2→N3 com validação</b>, assíncrona e com acompanhamento em tempo real, "
    "além de eliminar 8 bugs encadeados que impediam qualquer resposta.", BODY))
story.append(Spacer(1, 8))

resumo = Table([
    [Paragraph("<b>Área</b>", SMALL), Paragraph("<b>Entrega</b>", SMALL), Paragraph("<b>Situação</b>", SMALL)],
    [Paragraph("Memória de documentos", SMALL), Paragraph("Aba Markdown + extração automática de texto", SMALL), Paragraph("Concluído", SMALL)],
    [Paragraph("Modelos de petição", SMALL), Paragraph("Biblioteca compartilhada + roteamento por réu (V22)", SMALL), Paragraph("Concluído", SMALL)],
    [Paragraph("Chat / Agentes", SMALL), Paragraph("Correção de 8 bugs (auth, chave, modelos)", SMALL), Paragraph("Concluído e validado", SMALL)],
    [Paragraph("Orquestração", SMALL), Paragraph("Cadeia N1→N2→N3 assíncrona + tempo real (V23)", SMALL), Paragraph("Concluído e validado", SMALL)],
    [Paragraph("Gestão", SMALL), Paragraph("Acessos, convites, visibilidade, edição de agentes", SMALL), Paragraph("Concluído", SMALL)],
], colWidths=[42*mm, 80*mm, 32*mm])
resumo.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), GOLD),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, BG_SOFT]),
    ("GRID", (0,0), (-1,-1), 0.4, colors.HexColor("#e0d6b8")),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ("LEFTPADDING", (0,0), (-1,-1), 6),
]))
story.append(resumo)

# ───────────────── 2. MEMÓRIA / MARKDOWN ─────────────────
story.append(Paragraph("2. Memória de Documentos por Agente (aba Markdown)", H1))
hr()
story.append(Paragraph("Nova aba na configuração de cada agente para anexar arquivos de referência que servem de base de conhecimento.", BODY))
bullets([
    "Upload de <b>.txt, .md, .pdf e .docx</b> (até 10 MB) com arrastar-e-soltar ou seleção.",
    "Bucket de Storage <b>agent-documents</b> + tabela <b>agent_documents</b> (com RLS) criados no Supabase.",
    "Cada documento pode ser ativado/desativado, descrito e baixado.",
    "<b>Extração automática de texto</b> no upload: .docx via mammoth, .pdf via pdf.js, .txt/.md direto — o conteúdo fica pronto para o agente usar, sem etapa manual.",
])

# ───────────────── 3. MODELOS DE PETIÇÃO (V22) ─────────────────
story.append(Paragraph("3. Biblioteca de Modelos de Petição (Patch V22)", H1))
hr()
story.append(Paragraph("Estrutura para os agentes redigirem peças com base em modelos reais do escritório.", BODY))
bullets([
    "<b>document_library</b>: modelos tagueados (tipo de peça, categoria, réu) e compartilhados — não duplicados por agente.",
    "<b>agent_document_links</b>: ponte que define quais modelos cada agente pode usar.",
    "<b>routing_exclusivities</b>: regras de exclusividade por réu (Agiproteg, Agibank, Facta → exclusivos do sócio).",
    "O orquestrador classifica a demanda, verifica exclusividade e injeta o modelo relevante como referência (com prompt caching).",
])

# ───────────────── 4. GESTÃO DE ACESSOS ─────────────────
story.append(Paragraph("4. Gestão de Acessos e Convites", H1))
hr()
bullets([
    "Acesso da advogada <b>Ana Cristina</b> configurado (perfil Advogada de Confecção).",
    "Fluxo de convite ajustado: <b>sem validação inicial de e-mail</b>, link válido por <b>7 dias</b> para definição de senha; após o prazo, expira automaticamente.",
    "Sessão do usuário migrada para <b>localStorage</b> + renovação automática de token (não desloga a cada hora).",
])

# ───────────────── 5. VISIBILIDADE E LISTAGEM ─────────────────
story.append(Paragraph("5. Visibilidade de Telas e Listagem de Agentes", H1))
hr()
bullets([
    "Aba <b>Clientes</b> restrita a <b>Sócio (admin)</b> e <b>Recepção</b> — não aparece para os demais perfis.",
    "Listagem de agentes passou a mostrar o <b>dono real</b> de cada agente (não mais um nome fixo) e ganhou <b>filtro por dono</b>.",
    "Visão de catálogo completo dos agentes definidos por papel, com indicação de quais já foram instanciados.",
    "Diagnóstico do provisionamento: confirmado que cada usuário recebe seus agentes ao ser criado; ajustada a regra de visibilidade do perfil técnico.",
])

# ───────────────── 6. CORREÇÕES CRÍTICAS DO CHAT ─────────────────
story.append(PageBreak())
story.append(Paragraph("6. Correções Críticas — Agentes voltaram a responder", H1))
hr()
story.append(Paragraph("Os agentes não respondiam por uma cadeia de 8 problemas encadeados, cada um escondendo o próximo. Todos foram identificados e corrigidos:", BODY))
story.append(Spacer(1, 4))
bugs = Table([
    [Paragraph("<b>#</b>", SMALL), Paragraph("<b>Problema</b>", SMALL), Paragraph("<b>Correção</b>", SMALL)],
    [Paragraph("1", SMALL), Paragraph("Sessão expirava (sessionStorage / sessão zumbi)", SMALL), Paragraph("localStorage + validação no boot", SMALL)],
    [Paragraph("2", SMALL), Paragraph("Orquestrador lia coluna de chave inexistente", SMALL), Paragraph("Resolução via Supabase Vault (RPC)", SMALL)],
    [Paragraph("3", SMALL), Paragraph("Chave era exigida por usuário (BYOK)", SMALL), Paragraph("Chave universal por provedor", SMALL)],
    [Paragraph("4", SMALL), Paragraph("Chave padrão cadastrada estava inválida", SMALL), Paragraph("Promovida a chave válida do escritório", SMALL)],
    [Paragraph("5", SMALL), Paragraph("Parâmetro max_tokens rejeitado por modelos novos", SMALL), Paragraph("Uso de max_completion_tokens", SMALL)],
    [Paragraph("6", SMALL), Paragraph("Autenticação no servidor sempre falhava (401)", SMALL), Paragraph("Token passado explicitamente (bloqueador principal)", SMALL)],
    [Paragraph("7", SMALL), Paragraph("Erro 500 na seleção de modelos", SMALL), Paragraph("Consulta corrigida + tratamento global de erro", SMALL)],
    [Paragraph("8", SMALL), Paragraph("gpt-5.5 lento demais (timeout) e temperatura fixa", SMALL), Paragraph("Modelos rápidos por nível (gpt-4o / gpt-4o-mini)", SMALL)],
], colWidths=[8*mm, 78*mm, 68*mm])
bugs.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), DARK),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, BG_SOFT]),
    ("GRID", (0,0), (-1,-1), 0.4, colors.HexColor("#e0d6b8")),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ("LEFTPADDING", (0,0), (-1,-1), 5),
]))
story.append(bugs)
story.append(Spacer(1, 6))
story.append(Paragraph("Também foi corrigida a <b>chave universal do escritório</b>: uma única chave de API por provedor passou a valer para todos os usuários (atuais e futuros), independente de quem a cadastrou.", BODY))

# ───────────────── 7. ORQUESTRAÇÃO MULTI-AGENTE (V23) ─────────────────
story.append(Paragraph("7. Orquestração Multi-Agente N1→N2→N3 (Patch V23)", H1))
hr()
story.append(Paragraph("O chat deixou de ser de agente único e passou a operar como uma cadeia hierárquica com validação:", BODY))
story.append(Spacer(1, 4))
story.append(Paragraph("<b>Meu Assistente (N1)</b> &rarr; <b>Diretor (N2)</b> &rarr; <b>Especialista (N3)</b> &rarr; validação sobe de volta",
                       ParagraphStyle("flow", parent=BODY, alignment=TA_CENTER, fontSize=10.5, textColor=GOLD, spaceBefore=4, spaceAfter=8)))
bullets([
    "Apenas o <b>N3 (Especialista)</b> executa/redige; N1 e N2 analisam, encaminham e <b>validam</b>.",
    "Os validadores podem devolver ao especialista para corrigir, em até <b>2 rodadas</b>, antes de aprovar.",
    "Arquitetura <b>assíncrona</b>: cada etapa é uma chamada curta de IA que dispara a próxima — elimina o estouro de tempo que travava as peças longas.",
    "<b>Acompanhamento em tempo real</b>: a interface mostra as etapas ao vivo (“Encaminhado ao Diretor”, “Especialista redigindo”, “Em revisão”).",
    "Modelos por nível: N1/N2 usam um modelo rápido; N3 usa um modelo de qualidade — nunca o modelo flagship lento no chat.",
    "Provisionado um <b>Diretor (N2)</b> para todos os perfis que não tinham, completando a cadeia.",
])
story.append(Spacer(1, 4))
story.append(Paragraph("<b>Validação realizada:</b> uma solicitação de cobrança indevida (RMC) percorreu a cadeia completa — "
                       "Meu Assistente &rarr; Diretor de Área &rarr; Especialista Confecção Consumidor &rarr; resposta final — "
                       "com as etapas registradas e a resposta entregue com sucesso.",
                       ParagraphStyle("ok", parent=BODY, backColor=colors.HexColor("#eefaf0"), borderColor=colors.HexColor("#b6e3c4"),
                                      borderWidth=0.6, borderPadding=6)))

# ───────────────── 8. EDIÇÃO DE AGENTES ─────────────────
story.append(Paragraph("8. Correção da Edição de Agentes", H1))
hr()
bullets([
    "A permissão de salvar agentes era exclusiva do perfil técnico; o <b>Sócio (admin)</b> via a tela mas não salvava (a permissão bloqueava sem avisar).",
    "Corrigido: <b>admin, técnico e o dono do agente</b> podem editar/excluir.",
    "O salvamento agora é <b>honesto</b>: avisa de verdade se nada foi gravado, em vez de exibir falso sucesso.",
])

# ───────────────── 9. ANEXOS NO CHAT ─────────────────
story.append(Paragraph("9. Anexos de Arquivos no Chat", H1))
hr()
bullets([
    "Botão de anexar arquivo no campo de conversa (tela inicial e conversa em andamento).",
    "Arquivos anexados aparecem como <b>chips na parte superior</b>, separados da área de digitação (padrão dos chats modernos).",
])

# ───────────────── 10. PENDÊNCIAS ─────────────────
story.append(Paragraph("10. Observações e Próximos Passos", H1))
hr()
bullets([
    "Os 2 modelos de petição atuais estão em <b>.docx</b> sem texto extraído; recomenda-se re-enviá-los em .md/.txt para injeção automática no especialista.",
    "A chave de API inválida do sócio continua cadastrada (inativa como padrão); recomenda-se removê-la para evitar confusão.",
    "Validação final de cada fluxo na interface depende de login dos usuários (não realizável automaticamente por segurança); o backend foi validado de ponta a ponta.",
    "Evolução natural: refinar os prompts de cada nível e medir custo/tempo por mensagem na operação real.",
])
story.append(Spacer(1, 16))
story.append(HRFlowable(width="100%", thickness=0.7, color=colors.HexColor("#e0d6b8")))
story.append(Spacer(1, 4))
story.append(Paragraph("Documento gerado automaticamente a partir do registro de trabalho da plataforma JurisAI.", CAPTION))

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(GREY)
    canvas.drawString(20*mm, 12*mm, "JurisAI — Relatório de Implementação")
    canvas.drawRightString(190*mm, 12*mm, "Página %d" % doc.page)
    canvas.setStrokeColor(colors.HexColor("#e0d6b8"))
    canvas.line(20*mm, 15*mm, 190*mm, 15*mm)
    canvas.restoreState()

doc = SimpleDocTemplate(OUT, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm, leftMargin=20*mm, rightMargin=20*mm,
                        title="Relatorio JurisAI", author="JurisAI")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("PDF gerado em:", OUT)
