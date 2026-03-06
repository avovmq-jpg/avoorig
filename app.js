function byId(id) {
  return document.getElementById(id)
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const appState = {
  customers: [],
  clusters: [],
  visits: [],
  currentTab: "seeToday"
}

async function loadCustomersFromDB() {
  const { data, error } = await window.supabase
    .from("customers")
    .select("*")
    .order("name")

  if (error) {
    console.error("Customers load error:", error)
    return []
  }

  return data || []
}

async function loadClustersFromDB() {
  const { data, error } = await window.supabase
    .from("clusters")
    .select("*")
    .order("sequence_order")

  if (error) {
    console.error("Clusters load error:", error)
    return []
  }

  return data || []
}

async function loadVisitsFromDB() {
  const { data, error } = await window.supabase
    .from("visits")
    .select(`
      id,
      visit_date,
      outcome,
      notes,
      gps_lat,
      gps_lng,
      gps_accuracy,
      customer_id,
      customers (
        name,
        route_group
      )
    `)
    .order("visit_date", { ascending: false })

  if (error) {
    console.error("Visits load error:", error)
    return []
  }

  return data || []
}

function setTab(tabName) {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabName)
  })

  document.querySelectorAll(".tabpanel").forEach(panel => {
    panel.classList.remove("active")
  })

  const panel = byId(`tab-${tabName}`)
  if (panel) panel.classList.add("active")

  appState.currentTab = tabName
}

function getCompliance(customer) {
  if (!customer.existing) {
    return { label: "Prospect", color: "gray" }
  }

  const visitsRequired = 2
  const windowDays = 21
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - windowDays)

  const customerVisits = appState.visits.filter(v => {
    const matchName = v.customers?.name === customer.name
    const visitDate = new Date(v.visit_date)
    return matchName && visitDate >= cutoff
  })

  if (customerVisits.length >= visitsRequired) {
    return { label: "Compliant", color: "green" }
  }

  if (customerVisits.length === 1) {
    return { label: "Due", color: "amber" }
  }

  return { label: "Overdue", color: "red" }
}

function getTodayCluster() {
  return appState.clusters[0] || null
}

function renderTopCards() {
  const todayCluster = getTodayCluster()
  const eastCount = appState.customers.filter(c => c.route_group === "East" && c.existing).length
  const northCount = appState.customers.filter(c => c.route_group === "North" && c.existing).length

  byId("paceStatus").textContent = "Ready"
  byId("paceSub").textContent = "Start 08:30 • Target 20 calls"

  byId("todayCluster").textContent = todayCluster ? todayCluster.cluster_name : "No cluster loaded"
  byId("todayClusterSub").textContent = todayCluster
    ? `Day ${todayCluster.day_number} • ${todayCluster.region || ""}`
    : "Load clusters from database"

  byId("targetsKpi").textContent = `East ${eastCount}/35 • North ${northCount}/35`
  byId("targetsSub").textContent = "Actives currently loaded from database"
}

function renderCustomers() {
  const list = byId("customerList")
  if (!list) return

  if (!appState.customers.length) {
    list.innerHTML = `<div class="item">No customers loaded.</div>`
    return
  }

  list.innerHTML = appState.customers.map(customer => {
    const compliance = getCompliance(customer)

    return `
      <div class="item">
        <h4>${esc(customer.name)}</h4>
        <div class="meta">
          <span>${esc(customer.route_group || "")}</span>
          <span>${esc(customer.region || "")}</span>
          <span>${esc(customer.suburb || "")}</span>
          <span>Tier ${esc(customer.tier || "B")}</span>
          <span>${customer.existing ? "Existing" : "Prospect"}</span>
          <span>${esc(compliance.label)}</span>
        </div>
        <div class="meta">
          <span>Key Contact: ${esc(customer.key_contact || "-")}</span>
          <span>Next Action: ${esc(customer.next_action || "-")}</span>
        </div>
      </div>
    `
  }).join("")
}

function generateTodayList() {
  const list = byId("todayList")
  if (!list) return

  if (!appState.customers.length) {
    list.innerHTML = `<div class="item">No customers available.</div>`
    return
  }

  const sorted = [...appState.customers].sort((a, b) => {
    const aCompliance = getCompliance(a).label
    const bCompliance = getCompliance(b).label

    const score = label => {
      if (label === "Overdue") return 3
      if (label === "Due") return 2
      if (label === "Compliant") return 1
      return 0
    }

    return score(bCompliance) - score(aCompliance)
  })

  const top20 = sorted.slice(0, 20)

  list.innerHTML = top20.map(customer => {
    const compliance = getCompliance(customer)
    return `
      <div class="item">
        <h4>${esc(customer.name)}</h4>
        <div class="meta">
          <span>${esc(customer.route_group || "")}</span>
          <span>${esc(customer.suburb || "")}</span>
          <span>${esc(compliance.label)}</span>
          <span>${customer.existing ? "Existing" : "Prospect"}</span>
        </div>
      </div>
    `
  }).join("")
}

function renderClusters() {
  const list = byId("clusterList")
  if (!list) return

  if (!appState.clusters.length) {
    list.innerHTML = `<div class="item">No clusters loaded.</div>`
    return
  }

  list.innerHTML = appState.clusters.map(cluster => `
    <div class="item">
      <h4>Day ${esc(cluster.day_number)} • ${esc(cluster.cluster_name)}</h4>
      <div class="meta">
        <span>${esc(cluster.region || "")}</span>
        <span>Sequence ${esc(cluster.sequence_order || "")}</span>
      </div>
    </div>
  `).join("")
}

function renderRecentVisits() {
  const list = byId("recentVisits")
  if (!list) return

  if (!appState.visits.length) {
    list.innerHTML = `<div class="item">No visits saved yet.</div>`
    return
  }

  list.innerHTML = appState.visits.slice(0, 20).map(visit => `
    <div class="item">
      <h4>${esc(visit.customers?.name || "Unknown customer")}</h4>
      <div class="meta">
        <span>${esc(visit.visit_date)}</span>
        <span>${esc(visit.outcome)}</span>
        <span>${esc(visit.customers?.route_group || "")}</span>
      </div>
      <div>${esc(visit.notes || "")}</div>
    </div>
  `).join("")
}

function renderReportSnapshot() {
  const list = byId("reportSnapshot")
  if (!list) return

  const totalCalls = appState.visits.length
  const activeVisits = appState.visits.filter(v => v.outcome === "active").length
  const trialVisits = appState.visits.filter(v => v.outcome === "trial").length
  const sampleVisits = appState.visits.filter(v => v.outcome === "sample").length

  list.innerHTML = `
    <div class="item">
      <h4>Snapshot</h4>
      <div class="meta">
        <span>Total Visits: ${totalCalls}</span>
        <span>Samples: ${sampleVisits}</span>
        <span>Trials: ${trialVisits}</span>
        <span>Actives: ${activeVisits}</span>
      </div>
    </div>
  `
}

async function saveVisitToDB() {
  const customerName = byId("visitCustomer").value.trim()
  const routeGroup = byId("visitRouteGroup").value
  const outcome = byId("visitOutcome").value
  const notes = byId("visitNotes").value.trim()
  const keyContact = byId("visitKeyContact").value.trim()
  const nextAction = byId("visitNextAction").value.trim()

  if (!customerName) {
    alert("Please select a customer")
    return
  }

  const customer = appState.customers.find(c => c.name === customerName)

  if (!customer) {
    alert("Customer not found in database")
    return
  }

  const { error: visitError } = await window.supabase
    .from("visits")
    .insert({
      customer_id: customer.id,
      visit_date: todayISO(),
      outcome,
      notes
    })

  if (visitError) {
    console.error("Visit save error:", visitError)
    alert("Visit could not be saved")
    return
  }

  const { error: customerError } = await window.supabase
    .from("customers")
    .update({
      key_contact: keyContact,
      next_action: nextAction
    })
    .eq("id", customer.id)

  if (customerError) {
    console.error("Customer update error:", customerError)
  }

  alert("Visit saved")

  byId("visitNotes").value = ""
  byId("visitKeyContact").value = ""
  byId("visitNextAction").value = ""

  await initialiseApp()
}

async function initialiseApp() {
  appState.customers = await loadCustomersFromDB()
  appState.clusters = await loadClustersFromDB()
  appState.visits = await loadVisitsFromDB()

  renderTopCards()
  renderCustomers()
  renderClusters()
  renderRecentVisits()
  renderReportSnapshot()
  generateTodayList()
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      setTab(btn.dataset.tab)
    })
  })

  const generateBtn = byId("btnGenerateToday")
  if (generateBtn) {
    generateBtn.addEventListener("click", generateTodayList)
  }

  const saveVisitBtn = byId("btnSaveVisit")
  if (saveVisitBtn) {
    saveVisitBtn.addEventListener("click", saveVisitToDB)
  }
}

window.addEventListener("load", async () => {
  bindEvents()
  setTab("seeToday")
  await initialiseApp()
})
