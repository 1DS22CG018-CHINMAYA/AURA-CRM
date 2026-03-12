/**
 * MarkdownRenderer
 * ----------------
 * Lightweight, zero-dependency markdown renderer targeting exactly what
 * the Aura CRM LLM produces:
 *
 *   • Section headers  — short lines ending with ":"
 *   • Bullet items     — lines starting with "* " or "- "
 *   • Inline bold      — **text** → <strong>
 *   • Regular prose    — everything else becomes a paragraph
 *
 * Why not react-markdown? Zero bundle impact and no edge-case surprises
 * from a library that parses full CommonMark.
 */

/** Render a single line's inline markdown (bold only for now). */
function InlineText({ text, color }) {
    // Split on **...**  →  [plain, bold, plain, bold, …]
    const parts = text.split(/\*\*([^*]+)\*\*/g)

    return (
        <>
            {parts.map((part, i) =>
                i % 2 === 1 ? (
                    <strong key={i} style={{ color: '#e2e8f0', fontWeight: 600 }}>
                        {part}
                    </strong>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </>
    )
}

/**
 * @param {object}  props
 * @param {string}  props.children   — raw markdown string
 * @param {object}  [props.style]    — optional wrapper style
 * @param {string}  [props.prose]    — colour for prose text (default #94a3b8)
 * @param {string}  [props.accent]   — colour for section headers (default #a78bfa)
 */
export default function MarkdownRenderer({
    children = '',
    style,
    prose = '#94a3b8',
    accent = '#a78bfa',
}) {
    const lines = children.split('\n')
    const elements = []
    let bullets = []     // buffer — flushed into a <ul> when the run ends

    function flushBullets() {
        if (bullets.length === 0) return
        elements.push(
            <ul
                key={`ul-${elements.length}`}
                style={{
                    margin: '4px 0 10px',
                    paddingLeft: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    listStyle: 'none',
                }}
            >
                {bullets.map((text, i) => (
                    <li
                        key={i}
                        style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '8px',
                            fontSize: '13px',
                            color: prose,
                            lineHeight: 1.65,
                        }}
                    >
                        {/* Custom bullet dot */}
                        <span
                            style={{
                                width: '5px',
                                height: '5px',
                                borderRadius: '50%',
                                background: accent,
                                flexShrink: 0,
                                marginTop: '7px',
                            }}
                        />
                        <InlineText text={text} />
                    </li>
                ))}
            </ul>
        )
        bullets = []
    }

    for (const rawLine of lines) {
        const line = rawLine.trim()

        // ── blank line → flush bullets + soft break ───────────────────────────
        if (!line) {
            flushBullets()
            elements.push(<div key={`gap-${elements.length}`} style={{ height: '6px' }} />)
            continue
        }

        // ── bullet line ───────────────────────────────────────────────────────
        if (line.startsWith('* ') || line.startsWith('- ')) {
            bullets.push(line.slice(2))
            continue
        }

        // Non-bullet → flush whatever bullets accumulated so far
        flushBullets()

        // ── section header: short, ends with ":", no inline bold ─────────────
        const isHeader =
            line.endsWith(':') &&
            line.length < 64 &&
            !line.includes('**')

        if (isHeader) {
            elements.push(
                <p
                    key={`h-${elements.length}`}
                    style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        color: accent,
                        textTransform: 'uppercase',
                        letterSpacing: '0.12em',
                        margin: '14px 0 6px',
                    }}
                >
                    {line.slice(0, -1)}   {/* strip the trailing colon */}
                </p>
            )
            continue
        }

        // ── regular prose paragraph ───────────────────────────────────────────
        elements.push(
            <p
                key={`p-${elements.length}`}
                style={{
                    fontSize: '13px',
                    color: prose,
                    lineHeight: 1.72,
                    margin: '0 0 6px',
                }}
            >
                <InlineText text={line} />
            </p>
        )
    }

    // Flush any trailing bullets
    flushBullets()

    return <div style={style}>{elements}</div>
}
