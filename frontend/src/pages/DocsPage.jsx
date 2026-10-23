import React, { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import Brand from '../components/Brand.jsx';
import { docs, searchDocs } from '../lib/docs-content.mjs';

const href = doc => doc.slug === 'introduction' ? '/docs' : `/docs/${doc.slug}`;
const groups = [...new Set(docs.map(doc => doc.group))];

export default function DocsPage() {
  const { slug = 'introduction' } = useParams();
  const navigate = useNavigate();
  const doc = docs.find(item => item.slug === slug);
  const index = docs.indexOf(doc);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');
  const matches = searchDocs(query);
  const previous = docs[index - 1], next = docs[index + 1];

  useEffect(() => {
    setActive(doc?.sections[0]?.id || '');
    if (!doc || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.find(entry => entry.isIntersecting);
      if (visible) setActive(visible.target.id);
    }, { rootMargin: '-12% 0px -65% 0px' });
    for (const section of doc.sections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [doc]);

  return <div className="docs-page">
    <a className="docs-skip" href="#docs-article">Skip to article</a>
    <header className="docs-header">
      <div className="docs-header-brand"><Brand/><span className="docs-label">Documentation</span></div>
      <nav aria-label="Documentation header"><Link to="/">Home</Link><Link className="primary" to="/app">Launch App</Link></nav>
    </header>
    <div className="docs-layout">
      <aside className="docs-sidebar" aria-label="Documentation navigation">
        <label className="docs-search"><span>Search documentation</span><input type="search" placeholder="Search guides…" value={query} onChange={event => setQuery(event.target.value)}/></label>
        <label className="docs-mobile-select"><span className="sr-only">Choose a guide</span><select value={doc?.slug || ''} onChange={event => { setQuery(''); navigate(href(docs.find(item => item.slug === event.target.value))); }}><option value="" disabled>Choose a guide</option>{docs.map(item => <option key={item.slug} value={item.slug}>{item.title}</option>)}</select></label>
        <nav className="docs-nav" aria-label="Guides">
          {groups.map(group => {
            const items = matches.filter(item => item.group === group);
            return items.length > 0 && <div className="docs-nav-group" key={group}><span>{group}</span>{items.map(item => <NavLink end to={href(item)} key={item.slug} onClick={() => setQuery('')}>{item.title}</NavLink>)}</div>;
          })}
          {!matches.length && <p className="docs-no-results">No guides match this search.</p>}
        </nav>
        <div className="docs-sidebar-note"><span className="docs-network-dot"/>Built on Monad<span>Studios powered by Chog Genesis.</span></div>
      </aside>
      <main className="docs-main" id="docs-article" tabIndex={-1}>
        {query.trim() && <section className="docs-search-results" aria-label="Search results"><div><strong>Search results</strong><span>{matches.length} {matches.length === 1 ? 'guide' : 'guides'} found</span></div>{matches.length ? matches.map(item => <Link key={item.slug} to={href(item)} onClick={() => setQuery('')}><strong>{item.title}</strong><span>{item.summary}</span></Link>) : <p>Try “first buy”, “fees”, “ownership” or “points”.</p>}</section>}
        {doc ? <article>
          <header className="docs-article-header"><div className="docs-breadcrumb"><Link to="/docs">Docs</Link><span>/</span><span>{doc.group}</span></div><span className="eyebrow">CHOG FOUNDRY GUIDES</span><h1>{doc.title}</h1><p>{doc.summary}</p><div className="docs-article-meta"><span>{doc.sections.length} sections</span><span>Monad Mainnet</span><span>Product guide</span></div></header>
          {doc.slug === 'introduction' && <div className="docs-start-cards">{['getting-started','launching','trading'].map(value => {
            const item = docs.find(guide => guide.slug === value);
            return <Link key={value} to={href(item)}><span>{item.group}</span><strong>{item.title}</strong><p>{item.summary}</p><small>Read guide</small></Link>;
          })}</div>}
          {doc.sections.map(section => <section className="docs-content-section" id={section.id} key={section.id}>
            <h2><a href={`#${section.id}`}>{section.title}<span aria-hidden="true">#</span></a></h2>
            {section.paragraphs?.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
            {section.steps && <ol className="docs-steps">{section.steps.map((step, i) => <li key={i}><span aria-hidden="true">{String(i + 1).padStart(2,'0')}</span><p>{step}</p></li>)}</ol>}
            {section.bullets && <ul>{section.bullets.map((item, i) => <li key={i}>{item}</li>)}</ul>}
            {section.table && <div className="docs-table-wrap" tabIndex={0} role="region" aria-label={`${section.title} table`}><table><thead><tr>{section.table.headers.map(header => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{section.table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>}
            {section.note && <aside className="docs-callout"><strong>{section.note.title}</strong><p>{section.note.text}</p></aside>}
          </section>)}
          <div className="docs-article-end"><span className="eyebrow">READY WHEN YOU ARE</span><p>Put the guide into practice in your own studio or market.</p><Link className="secondary" to="/app">Open Chog Foundry</Link></div>
          <nav className="docs-pagination" aria-label="Guide navigation">{previous ? <Link to={href(previous)}><span>Previous guide</span><strong>{previous.title}</strong></Link> : <span/>}{next && <Link to={href(next)}><span>Next guide</span><strong>{next.title}</strong></Link>}</nav>
        </article> : <div className="docs-missing"><span className="eyebrow">DOCUMENTATION</span><h1>Guide not found</h1><p>Choose a guide from the navigation or return to the introduction.</p><Link className="primary" to="/docs">Browse documentation</Link></div>}
        <footer className="docs-footer"><span>Chog Foundry</span><Link to="/">Back to the Foundry</Link><Link to="/app/network">Network & deployment</Link></footer>
      </main>
      <aside className="docs-toc" aria-label="On this page">{doc && <><span className="eyebrow">ON THIS PAGE</span><nav>{doc.sections.map(section => <a key={section.id} href={`#${section.id}`} aria-current={active === section.id ? 'location' : undefined}>{section.title}</a>)}</nav><div><span>Explore the product</span><Link to="/app/studios">Your studios</Link><Link to="/app/markets">Token markets</Link></div></>}</aside>
    </div>
  </div>;
}
