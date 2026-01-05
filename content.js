(function() {
  // --- Helpers ---

  // Removed strict visibility check as it can be flaky in some contexts
  function isVisible(elem) {
    return true; 
  }

  // Extract text with basic Markdown formatting
  function getFormattedText(node) {
    if (!node) return "";
    
    // Text node
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    
    // Element node
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    
    // Skip strictly hidden/structural elements if needed, but for now be permissive
    // Notion code blocks: don't format internal content, handled by code block parser?
    // Actually, we do want text content of code blocks, but usually `textContent` is enough.
    // However, if we are inside a contenteditable, we want to recurse.

    let content = "";
    
    // If it's a code block container, just get text content to avoid formatting code syntax
    // But `getFormattedText` is called on the *content* of the block.
    // If we are processing a Code Block, we usually grab `.textContent` directly.
    // For other blocks, we recurse.
    
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
      
      let markdown = "";
      
      const children = Array.from(element.children);
      
      children.forEach(child => {
          // Filter comments
          if (child.classList.contains('notion-margin-discussion-item') || 
              child.querySelector('.notion-margin-discussion-item')) {
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
      // Check if it's a text block or just has text content
      const text = getBlockContent(node);
      if (text) {
          return `${indent}${text}\n\n`;
      }
      
      // If we are here, we found a block but extracted no text.
      // It might be a grouping block or column that `parseNotionBlock` didn't recurse into
      // because `processBlock` claimed it.
      // We should check for nested blocks.
      
      // If the node has children that are notion-selectable, we should recurse.
      if (node.querySelector('.notion-selectable')) {
          return parseNotionBlock(node, depth);
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
      
      // Look for the "row" div. It usually contains the text.
      // Heuristic: The row is the child that contains the contenteditable.
      const contentDiv = node.querySelector('[contenteditable="true"]');
      
      let row;
      if (contentDiv) {
          // Walk up from contentDiv to find the direct child of `node`
          let curr = contentDiv;
          while (curr && curr.parentElement !== node) {
              curr = curr.parentElement;
          }
          row = curr;
          text = getFormattedText(contentDiv).trim();
      } else {
          // Fallback if no contenteditable found
          row = children[0];
          text = getFormattedText(row).trim();
      }
      
      // Find nested container
      // Usually a sibling of the row, or deeper inside the row structure
      // Notion nested lists are often siblings of the row div in the block div.
      nested = children.find(c => c !== row);
      
      // If not a sibling, look inside the row. Notion often puts nested content inside the flex-grow item.
      if (!nested && row) {
          // Look for a child of row that contains blocks but IS NOT the one containing the text we just read.
          // The flex item containing text:
          const textContainerFlexItem = contentDiv ? contentDiv.closest('div[style*="flex-grow"]') : null;
          
          if (textContainerFlexItem) {
              // Does this flex item contain *other* blocks?
              const nestedBlocks = Array.from(textContainerFlexItem.children).filter(c => c.classList.contains('notion-selectable'));
              if (nestedBlocks.length > 0) {
                  // We can't return a single element if there are multiple.
                  // We need to return a wrapper or handle it.
                  // `parseNotionBlock` takes an element and iterates its children.
                  // So we can return `textContainerFlexItem`. 
                  // BUT `parseNotionBlock` will re-process the text block if we are not careful?
                  // `contentDiv` is usually NOT `notion-selectable`.
                  // So `parseNotionBlock` on `textContainerFlexItem` will iterate children.
                  // If children are `notion-selectable`, it processes them.
                  // If `contentDiv` is effectively a leaf (text), it will be skipped by `parseNotionBlock`'s `if (child.classList.contains('notion-selectable'))`.
                  // So this is safe!
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
