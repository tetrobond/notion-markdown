(function() {
  // Helper to check if an element is visible
  function isVisible(elem) {
    return !!(elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length);
  }

  // Helper to extract text with basic Markdown formatting (bold, italic, links, code)
  function getFormattedText(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    
    // Ignore hidden elements
    if (!isVisible(node)) return "";

    let content = "";
    const tagName = node.tagName.toLowerCase();
    
    // Handle children first
    node.childNodes.forEach(child => {
      content += getFormattedText(child);
    });

    // Clean up content
    // content = content.trim(); // Don't trim strictly here as it kills spacing between spans

    // Apply formatting based on tag
    if (tagName === 'b' || tagName === 'strong' || node.style.fontWeight === 'bold' || parseInt(window.getComputedStyle(node).fontWeight) >= 600) {
      // Avoid double wrapping if children already handled it (naive check)
      if (!content.startsWith('**')) content = `**${content}**`;
    }
    if (tagName === 'i' || tagName === 'em' || node.style.fontStyle === 'italic') {
      if (!content.startsWith('_')) content = `_${content}_`;
    }
    if (tagName === 'code' || node.classList.contains('code')) {
      if (!content.startsWith('`')) content = `\`${content}\``;
    }
    if (tagName === 'a' && node.href) {
      content = `[${content}](${node.href})`;
    }
    if (tagName === 's' || tagName === 'strike' || node.style.textDecoration.includes('line-through')) {
       content = `~${content}~`;
    }

    return content;
  }

  // Specific walker for Notion .layout-content structure
  function parseNotionLayout(element) {
      let md = "";
      
      // Notion content is usually a flat list of blocks or nested groups.
      // We will iterate through children.
      
      function walk(node, depth = 0) {
          if (!isVisible(node)) return;

          const tagName = node.tagName.toLowerCase();
          
          // Handle Headers
          if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
             const level = parseInt(tagName.substring(1));
             const text = getFormattedText(node).trim();
             md += `${'#'.repeat(level)} ${text}\n\n`;
             return;
          }
          
          // Handle Foldable (Details)
          if (tagName === 'details') {
              const summary = node.querySelector('summary');
              const title = summary ? getFormattedText(summary).trim() : "Toggle";
              // Determine level based on visual size or depth? 
              // Prompt says "Determine the appropriate Markdown header level (H2, H3, etc.) based on their visual size/style"
              // We'll approximate with depth.
              const level = Math.min(6, 2 + depth); 
              md += `${'#'.repeat(level)} ${title}\n\n`;
              
              // Process content
              Array.from(node.children).forEach(child => {
                  if (child !== summary) walk(child, depth + 1);
              });
              return;
          }

          // Handle Lists
          if (tagName === 'ul' || tagName === 'ol') {
             Array.from(node.children).forEach(li => {
                 if (li.tagName.toLowerCase() === 'li') {
                     const bullet = tagName === 'ul' ? '-' : '1.';
                     // Basic text extraction for LI
                     // Check if LI has nested list (Notion sometimes puts nested UL inside LI)
                     let liText = "";
                     Array.from(li.childNodes).forEach(c => {
                         if (c.tagName !== 'UL' && c.tagName !== 'OL') {
                             liText += getFormattedText(c);
                         }
                     });
                     md += `${bullet} ${liText.trim()}\n`;
                     
                     // Recurse for nested lists
                     Array.from(li.children).forEach(c => {
                         if (c.tagName === 'UL' || c.tagName === 'OL') {
                            // Indent? Markdown doesn't support strict indentation easily without complex logic, 
                            // but we can just emit it.
                            walk(c, depth); // walk will handle the nested UL/OL
                         }
                     });
                 }
             });
             md += '\n';
             return;
          }
          
          // Handle Code Blocks
          if (tagName === 'pre') {
             md += "```\n" + node.textContent + "\n```\n\n";
             return;
          }
          
          // Handle Paragraphs / Text
          // If node is a P or a DIV that looks like a text block (has text, no block children)
          const hasBlockChildren = Array.from(node.children).some(c => 
             ['div', 'p', 'h1', 'h2', 'h3', 'ul', 'ol', 'pre', 'details'].includes(c.tagName.toLowerCase())
          );
          
          if ((tagName === 'p' || tagName === 'div') && !hasBlockChildren) {
             const text = getFormattedText(node).trim();
             if (text) {
                 md += `${text}\n\n`;
             }
             return;
          }
          
          // Recurse if it's a container
          Array.from(node.children).forEach(child => walk(child, depth));
      }
      
      walk(element);
      return md;
  }

  // --- Main Execution ---
  
  const layouts = document.querySelectorAll('.layout-content');
  
  if (layouts.length < 2) {
      // Fallback: maybe only 1 layout-content found? Or structure is different.
      // If only 1, try to use it as body.
      // But prompt specifically says 1st is Title, 2nd is Body.
      if (layouts.length === 1) {
          // Assuming title might be elsewhere or this is the body.
          // Let's try to find title in standard Notion title class `notion-page-block` if possible.
          return "# " + (document.title || "Untitled") + "\n\n" + parseNotionLayout(layouts[0]);
      }
      return "Error: Could not identify Notion page structure (.layout-content).";
  }
  
  // 1. Title
  const titleNode = layouts[0];
  const title = titleNode.textContent.trim() || "Untitled";
  
  // 2. Body
  const bodyNode = layouts[1];
  const bodyMarkdown = parseNotionLayout(bodyNode);
  
  return `# ${title}\n\n${bodyMarkdown}`;

})();
