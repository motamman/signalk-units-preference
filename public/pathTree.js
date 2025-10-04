// Path tree utility functions

let pathTree = {}

// Extract paths, values, and metadata from SignalK API response
function extractPathsFromSignalK(obj) {
  const paths = []
  const values = {}
  const metadata = {}

  function extractRecursive(obj, prefix = '') {
    if (!obj || typeof obj !== 'object') return

    for (const key in obj) {
      if (
        key === 'meta' ||
        key === 'timestamp' ||
        key === 'source' ||
        key === '$source' ||
        key === 'values' ||
        key === 'sentence'
      )
        continue

      const currentPath = prefix ? `${prefix}.${key}` : key

      if (obj[key] && typeof obj[key] === 'object') {
        if (obj[key].value !== undefined) {
          paths.push(currentPath)
          values[currentPath] = obj[key].value
          // Extract metadata units if available
          if (obj[key].meta?.units) {
            metadata[currentPath] = obj[key].meta.units
          }
        }
        extractRecursive(obj[key], currentPath)
      }
    }
  }

  // Get the self vessel ID
  const selfVesselId = obj.self
  const actualSelfId =
    selfVesselId && selfVesselId.startsWith('vessels.')
      ? selfVesselId.replace('vessels.', '')
      : selfVesselId

  // Process self vessel if it exists
  if (obj.vessels && actualSelfId && obj.vessels[actualSelfId]) {
    extractRecursive(obj.vessels[actualSelfId], '')
  }

  return { paths: paths.sort(), values, metadata }
}

// Load available paths from SignalK API
async function loadPaths() {
  console.log('loadPaths() called')
  try {
    const res = await fetch('/signalk/v1/api/')
    if (!res.ok) throw new Error('Failed to load SignalK data')

    const data = await res.json()
    const extracted = extractPathsFromSignalK(data)

    availablePaths = extracted.paths
    signalKValues = extracted.values
    signalKMetadata = extracted.metadata

    console.log('Extracted paths:', availablePaths.length)

    // Send metadata to backend
    await fetch(`${API_BASE}/signalk-metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(extracted.metadata)
    })

    // Build tree structure
    pathTree = buildPathTree(availablePaths)
    console.log('Built path tree')

    // Render tree
    renderPathTree()
  } catch (error) {
    console.error('Failed to load paths:', error)
  }
}

// Build hierarchical tree from flat path list
function buildPathTree(paths) {
  const tree = {}

  paths.forEach(path => {
    const parts = path.split('.')
    let current = tree

    parts.forEach((part, index) => {
      if (!current[part]) {
        current[part] = {
          _children: {},
          _fullPath: parts.slice(0, index + 1).join('.'),
          _hasValue: index === parts.length - 1
        }
      }
      current = current[part]._children
    })
  })

  return tree
}

// Render path tree
function renderPathTree() {
  console.log('renderPathTree() called')

  // Pattern tab
  const container = document.getElementById('pathTreeContainer')
  if (container) {
    console.log('pathTreeContainer found')
    container.innerHTML = renderTreeNode(pathTree, 0)

    // Setup search
    const searchInput = document.getElementById('pathTreeSearch')
    if (searchInput) {
      searchInput.addEventListener('input', e =>
        filterPathTree(e.target.value, 'pathTreeContainer')
      )
    }
  } else {
    console.log('pathTreeContainer not found')
  }

  // Metadata tab
  const metadataContainer = document.getElementById('metadataPathTree')
  if (metadataContainer) {
    console.log('metadataPathTree found')
    metadataContainer.innerHTML = renderTreeNode(pathTree, 0)

    const metadataSearchInput = document.getElementById('metadataPathSearch')
    if (metadataSearchInput) {
      metadataSearchInput.addEventListener('input', e =>
        filterPathTree(e.target.value, 'metadataPathTree')
      )
    }
  }

  // Override tab now uses autocomplete instead of tree
  console.log('Override path selection now uses autocomplete')
}

// Render a tree node
function renderTreeNode(node, level) {
  let html = ''

  const keys = Object.keys(node).sort()

  keys.forEach(key => {
    const item = node[key]
    const hasChildren = Object.keys(item._children).length > 0
    const classes = ['path-tree-item']

    if (item._hasValue) {
      classes.push('has-value')
    }

    html += `<div class="path-tree-node" data-level="${level}">`

    // Only make items with values selectable
    if (item._hasValue) {
      html += `<div class="${classes.join(' ')}" onclick="selectPath('${item._fullPath}')" data-path="${item._fullPath}" style="cursor: pointer;">`
    } else {
      html += `<div class="${classes.join(' ')}" data-path="${item._fullPath}" style="cursor: default; color: #999;">`
    }

    if (hasChildren) {
      html += `<span class="path-tree-toggle" onclick="event.stopPropagation(); toggleTreeNode(this)">▶</span>`
    } else {
      html += `<span class="path-tree-toggle"></span>`
    }

    html += `<span class="path-tree-label">${key}</span>`
    html += `</div>`

    if (hasChildren) {
      html += `<div class="path-tree-children">`
      html += renderTreeNode(item._children, level + 1)
      html += `</div>`
    }

    html += `</div>`
  })

  return html
}

// Toggle tree node expansion
function toggleTreeNode(toggle) {
  const treeNode = toggle.closest('.path-tree-node')
  const children = treeNode.querySelector('.path-tree-children')

  if (children) {
    const isExpanded = children.classList.contains('expanded')
    children.classList.toggle('expanded')
    toggle.textContent = isExpanded ? '▶' : '▼'
  }
}

// Select a path
function selectPath(path) {
  // Determine which tree this is from
  const clickedItem = event.target.closest('.path-tree-item')
  const container = clickedItem.closest('.path-tree-container')
  const isMetadataTree = container.id === 'metadataPathTree'

  // Remove previous selection in this container only
  container.querySelectorAll('.path-tree-item.selected').forEach(el => {
    el.classList.remove('selected')
  })

  // Add selection to clicked item
  clickedItem.classList.add('selected')

  if (isMetadataTree) {
    // Metadata tab
    selectMetadataPath(path)
  } else {
    // Pattern tab (legacy)
    const newOverridePathEl = document.getElementById('newOverridePath')
    if (newOverridePathEl) {
      newOverridePathEl.value = path
    }
    const selectedPathDisplayEl = document.getElementById('selectedPathDisplay')
    if (selectedPathDisplayEl) {
      selectedPathDisplayEl.textContent = path
    }
  }
}

// Filter path tree based on search
function filterPathTree(searchTerm, containerId) {
  const container = document.getElementById(containerId)
  if (!container) return

  if (!searchTerm) {
    // Show all, collapse all
    container.querySelectorAll('.path-tree-children').forEach(el => {
      el.classList.remove('expanded')
    })
    container.querySelectorAll('.path-tree-toggle').forEach(el => {
      if (el.textContent) el.textContent = '▶'
    })
    container.querySelectorAll('.path-tree-node').forEach(el => {
      el.style.display = ''
    })
    return
  }

  const lowerSearch = searchTerm.toLowerCase()

  // Filter and expand matching paths
  container.querySelectorAll('.path-tree-node').forEach(node => {
    const pathItem = node.querySelector('.path-tree-item')
    const path = pathItem.dataset.path

    if (path && path.toLowerCase().includes(lowerSearch)) {
      // Show this node
      node.style.display = ''

      // Expand all parents
      let parent = node.parentElement
      while (parent && parent.classList.contains('path-tree-children')) {
        parent.classList.add('expanded')
        const toggle = parent.previousElementSibling?.querySelector('.path-tree-toggle')
        if (toggle && toggle.textContent) toggle.textContent = '▼'
        parent = parent.parentElement?.parentElement
      }
    } else {
      node.style.display = 'none'
    }
  })
}
