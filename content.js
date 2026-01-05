(function() {
  const visited = new Set();
  const MAX_DEPTH = 500; // Protect against stack overflow

  // --- Helpers ---

  function isVisible(elem) {
    // Basic check for display:none
    if (elem.style && elem.style.display === 'none') return false;
    return true;
  }

  // Extract text with basic Markdown formatting
  function getFormattedText(node) {
    if (!node) return "";
    
    // Skip comments in text extraction
    if (node.nodeType === Node.ELEMENT_NODE && 
       (node.classList.contains('notion-margin-discussion-item') || node.classList.contains('notion-discussion-container'))) {
        return "";
    }
    
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    
    let content = "";
    node.childNodes.forEach(child => {
      content += getFormattedText(child);
    });

    // Formatting logic
    const tagName = node.tagName.toLowerCase();
    let style;
    try {
        style = window.getComputedStyle(node);
    } catch (e) {
        style = {};
    }
    
    // Bold
    if (tagName === 'b' || tagName === 'strong' || (style.fontWeight && parseInt(style.fontWeight) >= 600)) {
        if (content.trim() && !content.startsWith('**') && !content.endsWith('**')) content = `**${content}**`;
    }
    // Italic
    if (tagName === 'i' || tagName === 'em' || style.fontStyle === 'italic') {
        if (content.trim() && !content.startsWith('_') && !content.endsWith('_')) content = `_${content}_`;
    }
    // Strikethrough
    if (tagName === 's' || tagName === 'strike' || (style.textDecorationLine && style.textDecorationLine.includes('line-through'))) {
        if (content.trim() && !content.startsWith('~') && !content.endsWith('~')) content = `~${content}~`;
    }
    // Inline Code
    if (tagName === 'code' || (style.fontFamily && style.fontFamily.includes('monospace')) || node.classList.contains('notion-inline-code')) {
        if (content.trim() && !content.startsWith('`') && !content.endsWith('`')) content = `\`${content}\``;
    }
    // Links
    if (tagName === 'a' && node.href) {
        if (content.trim()) {
            content = `[${content}](${node.href})`;
        }
    }

    return content;
  }

  const NOTION_CLASSES = {
    HEADER: 'notion-header-block',
    SUB_HEADER: 'notion-sub_header-block',
    SUB_SUB_HEADER: 'notion-sub_sub_header-block',
    TEXT: 'notion-text-block',
    BULLETED_LIST: 'notion-bulleted_list-block',
    NUMBERED_LIST: 'notion-numbered_list-block',
    TO_DO: 'notion-to_do-block',
    TOGGLE: 'notion-toggle-block',
    QUOTE: 'notion-quote-block',
    CALLOUT: 'notion-callout-block',
    CODE: 'notion-code-block',
    IMAGE: 'notion-image-block',
    DIVIDER: 'notion-divider-block'
  };

  // --- Main Parsing Logic ---

  function parseNotionBlock(element, depth = 0) {
      if (!element) return "";
      if (depth > MAX_DEPTH) return "";
      
      // Prevent cycles
      if (visited.has(element)) return "";
      visited.add(element);
      
      let markdown = "";
      
      const children = Array.from(element.children);
      
      children.forEach(child => {
          // Filter comments - strict check on the element itself
          if (child.classList.contains('notion-margin-discussion-item') || 
              child.classList.contains('notion-discussion-container')) {
              return;
          }

          if (child.classList.contains('notion-selectable')) {
              markdown += processBlock(child, depth);
          } else {
              // Recurse into layout wrappers
              markdown += parseNotionBlock(child, depth);
          }
      });
      
      return markdown;
  }

  function processBlock(node, depth) {
      let md = "";
      const indent = "  ".repeat(depth);
      
      // 1. Headers
      if (node.classList.contains(NOTION_CLASSES.HEADER)) {
          return `\n# ${getBlockContent(node)}\n\n`;
      }
      if (node.classList.contains(NOTION_CLASSES.SUB_HEADER)) {
          return `\n## ${getBlockContent(node)}\n\n`;
      }
      if (node.classList.contains(NOTION_CLASSES.SUB_SUB_HEADER)) {
          return `\n### ${getBlockContent(node)}\n\n`;
      }

      // 2. Lists
      if (node.classList.contains(NOTION_CLASSES.BULLETED_LIST)) {
          const { text, nested } = getListContent(node);
          md += `${indent}- ${text}\n`;
          if (nested) md += parseNotionBlock(nested, depth + 1);
          return md;
      }
      if (node.classList.contains(NOTION_CLASSES.NUMBERED_LIST)) {
          const { text, nested } = getListContent(node);
          md += `${indent}1. ${text}\n`;
          if (nested) md += parseNotionBlock(nested, depth + 1);
          return md;
      }

      // 3. To-Do
      if (node.classList.contains(NOTION_CLASSES.TO_DO)) {
          const checkbox = node.querySelector('input[type="checkbox"]');
          const isChecked = checkbox && (checkbox.checked || checkbox.getAttribute('aria-checked') === 'true');
          const { text, nested } = getListContent(node);
          md += `${indent}- [${isChecked ? 'x' : ' '}] ${text}\n`;
          if (nested) md += parseNotionBlock(nested, depth + 1);
          return md;
      }

      // 4. Code
      if (node.classList.contains(NOTION_CLASSES.CODE)) {
          const codeEl = node.querySelector('code') || node.querySelector('[contenteditable="true"]') || node;
          const text = codeEl.textContent;
          let lang = "";
          if (text.trim().startsWith('flowchart') || text.trim().startsWith('graph') || text.trim().startsWith('sequenceDiagram')) {
              lang = "mermaid";
          }
          return `\n${indent}\`\`\`${lang}\n${text}\n${indent}\`\`\`\n\n`;
      }

      // 5. Quote
      if (node.classList.contains(NOTION_CLASSES.QUOTE)) {
          const text = getBlockContent(node);
          return `\n${indent}> ${text}\n\n`;
      }

      // 6. Callout
      if (node.classList.contains(NOTION_CLASSES.CALLOUT)) {
          const text = getBlockContent(node);
          const icon = node.querySelector('.notion-record-icon img, .notion-record-icon span');
          const iconText = icon ? (icon.getAttribute('alt') || icon.textContent) : "";
          return `\n${indent}> ${iconText} ${text}\n\n`;
      }

      // 7. Toggle
      if (node.classList.contains(NOTION_CLASSES.TOGGLE)) {
          const { text, nested } = getListContent(node);
          md += `\n${indent}<details>\n${indent}<summary>${text}</summary>\n\n`;
          if (nested) md += parseNotionBlock(nested, depth + 1);
          md += `${indent}</details>\n\n`;
          return md;
      }
      
      // 8. Divider
      if (node.classList.contains(NOTION_CLASSES.DIVIDER)) {
          return `\n---\n\n`;
      }

      // 9. Text (Explicit or Implicit)
      const text = getBlockContent(node);
      if (text) {
          return `${indent}${text}\n\n`;
      }
      
      // Fallback: If no text found, but has selectable children, recurse.
      if (node.querySelector('.notion-selectable')) {
          // IMPORTANT: Check visited to ensure we don't loop if we somehow got here with same node
          if (!visited.has(node)) {
             return parseNotionBlock(node, depth);
          } else {
             // If node is already visited, we might still need to process its children 
             // if they haven't been processed.
             // But parseNotionBlock adds to visited at START.
             // So if we are here, we are calling parseNotionBlock(node) again?
             // NO. processBlock(node) is called. node IS visited?
             // No, processBlock doesn't add to visited. parseNotionBlock does.
             // So node is NOT in visited (unless it's a cycle).
             // Wait. parseNotionBlock(parent) -> processBlock(child). child is NOT in visited.
             // So calling parseNotionBlock(child) is valid.
             return parseNotionBlock(node, depth);
          }
      }

      return "";
  }

  function getBlockContent(node) {
      const contentNode = node.querySelector('[contenteditable="true"]') || node.querySelector('.notion-text-block') || node;
      return getFormattedText(contentNode).trim();
  }

  function getListContent(node) {
      let text = "";
      let nested = null;
      
      const children = Array.from(node.children);
      const contentDiv = node.querySelector('[contenteditable="true"]');
      
      let row;
      if (contentDiv) {
          let curr = contentDiv;
          // Robust loop with limit
          let i = 0;
          while (curr && curr.parentElement !== node && i < 50) {
              curr = curr.parentElement;
              i++;
          }
          row = curr;
          text = getFormattedText(contentDiv).trim();
      } else {
          row = children[0];
          text = getFormattedText(row).trim();
      }
      
      nested = children.find(c => c !== row);
      
      if (!nested && row) {
          const textContainerFlexItem = contentDiv ? contentDiv.closest('div[style*="flex-grow"]') : null;
          
          if (textContainerFlexItem) {
              const nestedBlocks = Array.from(textContainerFlexItem.children).filter(c => c.classList.contains('notion-selectable'));
              if (nestedBlocks.length > 0) {
                  nested = textContainerFlexItem; 
              }
          }
      }
      
      return { text, nested };
  }

  // --- Initialization ---

  const layouts = document.querySelectorAll('.layout-content');
  if (layouts.length === 0) return "Error: No content found";

  let title = document.title;
  let bodyNode = layouts[0];
  
  if (layouts.length > 1) {
      const titleEl = layouts[0].querySelector('[contenteditable="true"]') || layouts[0];
      title = titleEl.textContent.trim();
      bodyNode = layouts[1];
  } else {
      const h1 = document.querySelector('.notion-page-block h1');
      if (h1) title = h1.textContent.trim();
  }

  const markdownBody = parseNotionBlock(bodyNode);
  return `# ${title}\n\n${markdownBody}`;

})();
