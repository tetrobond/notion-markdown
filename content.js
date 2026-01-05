(function() {
  // --- Helpers ---

  function isVisible(elem) {
    if (!elem) return false;
    return !!(elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length);
  }

  // Extract text with basic Markdown formatting
  function getFormattedText(node) {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    
    // Skip hidden elements, but allow structure wrappers
    if (!isVisible(node) && !node.classList.contains('notion-code-block')) return "";

    let content = "";
    node.childNodes.forEach(child => {
      content += getFormattedText(child);
    });

    // Formatting
    const style = window.getComputedStyle(node);
    const tagName = node.tagName.toLowerCase();
    
    // Bold
    if (tagName === 'b' || tagName === 'strong' || parseInt(style.fontWeight) >= 600) {
        if (content.trim() && !content.startsWith('**') && !content.endsWith('**')) content = `**${content}**`;
    }
    // Italic
    if (tagName === 'i' || tagName === 'em' || style.fontStyle === 'italic') {
        if (content.trim() && !content.startsWith('_') && !content.endsWith('_')) content = `_${content}_`;
    }
    // Strikethrough
    if (tagName === 's' || tagName === 'strike' || style.textDecorationLine.includes('line-through')) {
        if (content.trim() && !content.startsWith('~') && !content.endsWith('~')) content = `~${content}~`;
    }
    // Inline Code
    // Notion often uses specific font-family or a class for inline code
    if (tagName === 'code' || style.fontFamily.includes('monospace') || node.classList.contains('notion-inline-code')) {
        if (content.trim() && !content.startsWith('`') && !content.endsWith('`')) content = `\`${content}\``;
    }
    // Links
    if (tagName === 'a' && node.href) {
        // Notion links sometimes are just wrappers. 
        // Ensure we don't wrap empty content or block elements improperly.
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
      if (!element || !isVisible(element)) return "";
      
      let markdown = "";
      
      // Iterate through children to find blocks
      const children = Array.from(element.children);
      
      children.forEach(child => {
          // Filter comments
          if (child.classList.contains('notion-margin-discussion-item') || 
              child.querySelector('.notion-margin-discussion-item')) {
              return;
          }

          // Identify if this child is a block itself
          // Notion blocks have `notion-selectable` class
          if (child.classList.contains('notion-selectable')) {
              markdown += processBlock(child, depth);
          } else {
              // It's a layout wrapper, recurse
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

      // 2. Lists (Bulleted & Numbered)
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

      // 4. Code / Mermaid
      if (node.classList.contains(NOTION_CLASSES.CODE)) {
          const codeEl = node.querySelector('code') || node;
          const text = codeEl.textContent;
          let lang = "";
          // Attempt to find language class or assume based on content
          // Notion often puts language in a separate div or class
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

      // 6. Callout (Treat as blockquote or bold text)
      if (node.classList.contains(NOTION_CLASSES.CALLOUT)) {
          const text = getBlockContent(node);
          // Get icon if exists
          const icon = node.querySelector('.notion-record-icon img, .notion-record-icon span');
          const iconText = icon ? (icon.getAttribute('alt') || icon.textContent) : "";
          return `\n${indent}> ${iconText} ${text}\n\n`;
      }

      // 7. Toggle / Details
      if (node.classList.contains(NOTION_CLASSES.TOGGLE)) {
          const { text, nested } = getListContent(node); // Toggle header is like a list item
          md += `\n${indent}<details>\n${indent}<summary>${text}</summary>\n\n`;
          if (nested) md += parseNotionBlock(nested, depth + 1);
          md += `${indent}</details>\n\n`;
          return md;
      }
      
      // 8. Divider
      if (node.classList.contains(NOTION_CLASSES.DIVIDER)) {
          return `\n---\n\n`;
      }

      // 9. Text / Default
      // If it has text content, print it.
      const text = getBlockContent(node);
      if (text) {
          return `${indent}${text}\n\n`;
      }
      
      // If no text but has children blocks (rare for text block, but possible for grouping)
      return parseNotionBlock(node, depth);
  }

  // --- Content Extraction Helpers ---

  function getBlockContent(node) {
      // Content is usually in a contenteditable div or a specific text class
      // We look for the "content" part, avoiding metadata/icons
      const contentNode = node.querySelector('[contenteditable="true"]') || node.querySelector('.notion-text-block') || node;
      return getFormattedText(contentNode).trim();
  }

  function getListContent(node) {
      // Lists in Notion:
      // <div class="notion-selectable ...">
      //   <div style="display: flex ...">  <-- The Row
      //      <div ...> marker </div>
      //      <div ...> content </div>
      //   </div>
      //   <div ...> nested blocks </div>   <-- Nested Content (sometimes sibling of the Row)
      // </div>
      
      let text = "";
      let nested = null;
      
      // 1. Find the row with content
      const row = Array.from(node.children).find(c => {
          const style = window.getComputedStyle(c);
          return style.display === 'flex';
      });
      
      if (row) {
          // Extract text from the row
          // The text is usually in the last child of the flex container that isn't the marker
          // Or search for contenteditable
          const contentDiv = row.querySelector('[contenteditable="true"]');
          if (contentDiv) text = getFormattedText(contentDiv).trim();
          else text = getFormattedText(row).trim();
          
          // 2. Find nested container
          // Usually a sibling of the row, or inside the row's flex child if grouped
          nested = Array.from(node.children).find(c => c !== row);
          
          // Sometimes nested blocks are inside the flex item (user example showed this)
          // <div style="flex: 1 1 0px;"> 
          //    <div style="display: flex;"> ... content ... </div> 
          //    <div class="notion-selectable ..."> ... nested ... </div>
          // </div>
          if (!nested) {
             const flexItem = Array.from(row.children).find(c => c.style.flexGrow === '1');
             if (flexItem) {
                 nested = Array.from(flexItem.children).find(c => c.classList.contains('notion-selectable') || c.style.paddingLeft);
                 // If the flex item contains other blocks, we might need to return that flex item as the 'nested' container
                 // But we should filter out the text line we already read.
                 
                 // Strategy: If flexItem has children that are blocks, treat flexItem as the container for recursion
                 // filtering out the contentDiv
                 if (flexItem.querySelector('.notion-selectable')) {
                     // Create a proxy/dummy element or just handle it in recursion?
                     // We can just return flexItem, and the recursing `parseNotionBlock` will filter out non-blocks.
                     // But we must ensure it doesn't re-read the text we just extracted.
                     // The text was in `contentDiv`. 
                     // We can cheat: nested = flexItem, but in `parseNotionBlock`, we skip `contentDiv`? 
                     // Hard to pass that context. 
                     
                     // Better: Look specifically for the nested block container
                     nested = flexItem; // `parseNotionBlock` iterates children. 
                     // We just need to make sure `parseNotionBlock` on `flexItem` doesn't double-print the text.
                     // The text block in Notion is usually NOT `notion-selectable`, it's just a div.
                     // So `parseNotionBlock` which looks for `.notion-selectable` will skip the text div and find the nested blocks!
                     // This is the key: Text is leaf, Blocks are structural.
                 }
             }
          }
      } else {
          // Fallback
          text = getBlockContent(node);
      }
      
      return { text, nested };
  }

  // --- Initialization ---

  const layouts = document.querySelectorAll('.layout-content');
  if (layouts.length === 0) return "Error: No content found";

  // Title usually 1st, Body 2nd
  let title = document.title;
  let bodyNode = layouts[0];
  
  if (layouts.length > 1) {
      // 1st is title
      const titleEl = layouts[0].querySelector('[contenteditable="true"]') || layouts[0];
      title = titleEl.textContent.trim();
      bodyNode = layouts[1];
  } else {
      // Try to find title in standard header block
      const h1 = document.querySelector('.notion-page-block h1');
      if (h1) title = h1.textContent.trim();
  }

  const markdownBody = parseNotionBlock(bodyNode);
  return `# ${title}\n\n${markdownBody}`;

})();
