import {div, replaceWith} from "../core/dom"
import {RenderItem} from "./json"

function _get_element(elementid: string): HTMLElement {
  let element = document.getElementById(elementid)

  if (element == null)
    throw new Error(`Error rendering Bokeh model: could not find #${elementid} HTML tag`)
  if (!document.body.contains(element))
    throw new Error(`Error rendering Bokeh model: element #${elementid} must be under <body>`)

  // If autoload script, replace script tag with div for embedding.
  if (element.tagName == "SCRIPT") {
    const root_el = div()
    replaceWith(element, root_el)
    element = root_el
  }

  return element
}

export function _resolve_element(item: RenderItem): HTMLElement {
  const {elementid} = item

  if (elementid != null)
    return _get_element(elementid)
  else
    return document.body
}

export function _resolve_root_elements(item: RenderItem): HTMLElement[] {
  const roots: HTMLElement[] = []

  if ((item.root_ids != null) && (item.roots != null)) {
    for (const root_id of item.root_ids)
      roots.push(_get_element(item.roots[root_id]))
  }

  return roots
}
