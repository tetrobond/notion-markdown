(function() {
  const debug = false;
  const visited = new Set();

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
    DIVIDER: 'notion-divider-block',
    BLOCK_CLASS: 'notion-selectable',
    COMMENTS: [
      'notion-margin-discussion-item',
      'notion-discussion-container'
    ]
  };

  // --- Main Parsing Logic ---

  function parseNotionBlock(element, depth = 0) {
      if (!element) return "";

      // Prevent cycles
      if (visited.has(element)) return "";
      visited.add(element);
      
      let markdown = "";
      
      const children = Array.from(element.children);
      
      children.forEach(child => {
          // Filter comments
          if (NOTION_CLASSES.COMMENTS.some(cls => child.classList.contains(cls))) {
              if (debug) console.log("Skipping comment element:", child);
              return;
          }

          // Identify if this child is a block itself
          // Notion blocks have `notion-selectable` class
          markdown += child.classList.contains(NOTION_CLASSES.BLOCK_CLASS) ?
            processBlock(child, depth) :
            parseNotionBlock(child, depth); // Recurse into non-block children
      });
      
      return markdown;
  }

  function processBlock(node, depth) {
      let md = "";
      const indent = "  ".repeat(depth);

      // Extract text and any nested block containers
      const { text, nestedNodes } = extractNodeData(node);

      // Helper to process nested nodes
      const processNested = (d) => {
          let res = "";
          if (nestedNodes && nestedNodes.length > 0) {
              nestedNodes.forEach(child => {
                  if (child.classList.contains('notion-selectable')) {
                      res += processBlock(child, d);
                  } else {
                      res += parseNotionBlock(child, d);
                  }
              });
          }
          return res;
      };
      
      // 1. Headers
      if ([
            NOTION_CLASSES.HEADER,
            NOTION_CLASSES.SUB_HEADER,
            NOTION_CLASSES.SUB_SUB_HEADER
        ].some(cls => node.classList.contains(cls))) {
          return `\n# ${text}\n\n` + processNested(depth);
      }

      // 2. Lists
      if (node.classList.contains(NOTION_CLASSES.BULLETED_LIST)) {
          md += `${indent}- ${text}\n`;
          md += processNested(depth + 1);
          return md;
      }
      if (node.classList.contains(NOTION_CLASSES.NUMBERED_LIST)) {
          md += `${indent}1. ${text}\n`;
          md += processNested(depth + 1);
          return md;
      }

      // 3. To-Do
      if (node.classList.contains(NOTION_CLASSES.TO_DO)) {
          const checkbox = node.querySelector('input[type="checkbox"]');
          const isChecked = checkbox && (checkbox.checked || checkbox.getAttribute('aria-checked') === 'true');
          md += `${indent}- [${isChecked ? 'x' : ' '}] ${text}\n`;
          md += processNested(depth + 1);
          return md;
      }

      // 4. Code / Mermaid
      if (node.classList.contains(NOTION_CLASSES.CODE)) {
          const codeEl = node.querySelector('code') || node.querySelector('[contenteditable="true"]') || node;
          const codeText = codeEl.textContent; // Use raw text for code
          let lang = "";
          if (codeText.trim().startsWith('flowchart') || codeText.trim().startsWith('graph') || codeText.trim().startsWith('sequenceDiagram')) {
              lang = "mermaid";
          }
          md += `\n${indent}\`\`\`${lang}\n${codeText}\n${indent}\`\`\`\n\n`;
          // Code blocks rarely have nested blocks, but if they do:
          md += processNested(depth); 
          return md;
      }

      // 5. Quote
      if (node.classList.contains(NOTION_CLASSES.QUOTE)) {
          md += `\n${indent}> ${text}\n\n`;
          md += processNested(depth); // Keep same depth for nested items in quote? Or indent?
          return md;
      }

      // 6. Callout
      if (node.classList.contains(NOTION_CLASSES.CALLOUT)) {
          const icon = node.querySelector('.notion-record-icon img, .notion-record-icon span');
          const iconText = icon ? (icon.getAttribute('alt') || icon.textContent) : "";
          md += `\n${indent}> ${iconText} ${text}\n\n`;
          md += processNested(depth);
          return md;
      }

      // 7. Toggle
      if (node.classList.contains(NOTION_CLASSES.TOGGLE)) {
          md += `\n${indent}<details>\n${indent}<summary>${text}</summary>\n\n`;
          md += processNested(depth + 1);
          md += `${indent}</details>\n\n`;
          return md;
      }
      
      // 8. Divider
      if (node.classList.contains(NOTION_CLASSES.DIVIDER)) {
          return `\n---\n\n`;
      }

      // 9. Text / Default
      if (text) {
          md += `${indent}${text}\n\n`;
      }
      
      // Always process nested for text blocks too (indented paragraphs)
      md += processNested(depth + 1);

      return md;
  }

  function extractNodeData(node) {
      const children = Array.from(node.children);
      
      // Prioritize contenteditable or explicit text block
      const contentNode = node.querySelector('[contenteditable="true"]') || node.querySelector('.notion-text-block');
      
      let text = "";
      let contentContainer = null;

      if (contentNode) {
          text = getFormattedText(contentNode).trim();
          
          // Find the direct child of 'node' that contains this content
          let curr = contentNode;
          // Safety counter
          let i = 0;
          while (curr && curr.parentElement !== node && i < 50) {
              curr = curr.parentElement;
              i++;
          }
          if (curr && curr.parentElement === node) {
            contentContainer = curr;
          }
      }
      
      // If we didn't find contentContainer but have text (rare, maybe flat node?), 
      // assume no nested nodes relative to text if we can't separate them.
      // But typically, if we didn't find contentNode, text is empty.
      
      // Identify nested nodes: All children that are NOT the contentContainer
      // and NOT comments.
      const nestedNodes = children.filter(child => {
          if (child === contentContainer) return false;
          if (child.classList.contains('notion-margin-discussion-item')) return false;
          if (child.classList.contains('notion-discussion-container')) return false;
          if (!isVisible(child)) return false;
          return true;
      });

      return { text, nestedNodes };
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
