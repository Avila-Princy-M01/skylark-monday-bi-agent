export const mockDealsBoardSchema = {
  id: "1111111111",
  name: "Deals Tracker",
  columns: [
    { id: "name", title: "Deal Name", type: "name" },
    { id: "text_owner", title: "Owner code", type: "text" },
    { id: "text_client", title: "Client Code", type: "text" },
    { id: "status_deal", title: "Deal Status", type: "status" },
    { id: "date_close_a", title: "Close Date (A)", type: "date" }, // 100% empty column to test exclusion
    { id: "status_prob", title: "Closure Probability", type: "status" },
    { id: "numbers_val", title: "Masked Deal value", type: "numbers" },
    { id: "date_close_t", title: "Tentative Close Date", type: "date" },
    { id: "status_stage", title: "Deal Stage", type: "status" },
    { id: "text_prod", title: "Product deal", type: "text" },
    { id: "text_sec", title: "Sector/service", type: "text" },
    { id: "date_created", title: "Created Date", type: "date" },
  ],
};

export const mockDealsItems = [
  {
    id: "deal_001",
    name: "Naruto",
    column_values: [
      { id: "text_owner", text: "OWNER_001", value: null },
      { id: "text_client", text: "COMPANY089", value: null },
      { id: "status_deal", text: "Open", value: null },
      { id: "date_close_a", text: null, value: null },
      { id: "status_prob", text: "High", value: null },
      { id: "numbers_val", text: "489360", value: null },
      { id: "date_close_t", text: "2026-02-26", value: null },
      { id: "status_stage", text: "B. Sales Qualified Leads", value: null },
      { id: "text_prod", text: "Service + Spectra", value: null },
      { id: "text_sec", text: "Renewables", value: null },
      { id: "date_created", text: "2025-04-10", value: null },
    ],
  },
  // Masked ₹1 placeholder item
  {
    id: "deal_masked_002",
    name: "Sasuke",
    column_values: [
      { id: "text_owner", text: "OWNER_001", value: null },
      { id: "text_client", text: "COMPANY091", value: null },
      { id: "status_deal", text: "Open", value: null },
      { id: "date_close_a", text: null, value: null },
      { id: "status_prob", text: "Medium", value: null },
      { id: "numbers_val", text: "1.2332", value: null },
      { id: "date_close_t", text: "2026-02-28", value: null },
      { id: "status_stage", text: "B. Sales Qualified Leads", value: null },
      { id: "text_prod", text: "Service", value: null },
      { id: "text_sec", text: "Powerline", value: null },
      { id: "date_created", text: "2025-05-12", value: null },
    ],
  },
  // Junk Header row item (Nezuko)
  {
    id: "deal_junk_052",
    name: "Nezuko",
    column_values: [
      { id: "text_owner", text: "", value: null },
      { id: "text_client", text: null, value: null },
      { id: "status_deal", text: "Deal Status", value: null },
      { id: "date_close_a", text: "Close Date (A)", value: null },
      { id: "status_prob", text: "Closure Probability", value: null },
      { id: "numbers_val", text: null, value: null },
      { id: "date_close_t", text: null, value: null },
      { id: "status_stage", text: null, value: null },
      { id: "text_prod", text: null, value: null },
      { id: "text_sec", text: null, value: null },
      { id: "date_created", text: null, value: null },
    ],
  },
];
