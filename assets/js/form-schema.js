// Single source of truth for the membership form.
// Used by the browser (to render the form) AND by the server (to validate submissions).
// Category requirements come from the official ASWRA Membership Information Document.

export const LGAS = ["Aguata", "Anambra East", "Anambra West", "Anaocha", "Awka North", "Awka South", "Ayamelum", "Dunukofia", "Ekwusigo", "Idemili North", "Idemili South", "Ihiala", "Njikoka", "Nnewi North", "Nnewi South", "Ogbaru", "Onitsha North", "Onitsha South", "Orumba North", "Orumba South", "Oyi"];

const registration = { id: "registrationNumber", label: "Registration or incorporation number (if registered)", type: "text", max: 60 };

export const CATEGORIES = [
  {
    id: "individual", label: "Individual Recycler Members", org: false,
    summary: "Waste collectors, recovery workers, informal operators, independent recyclers and aggregators.",
    fields: [
      { id: "ageConfirmed", label: "I confirm that I am at least 18 years old.", type: "checkbox", required: true },
      { id: "connection", label: "Connection to Anambra State", type: "select", required: true,
        options: ["I reside in Anambra State", "I do not reside in Anambra State but I operate or work here"] },
      { id: "activities", label: "What best describes you?", type: "checkboxes", required: true, help: "Choose all that apply.",
        options: ["Waste collection", "Recovery of recyclable materials", "Aggregation", "Recycling", "I have a legitimate interest in waste collection or recycling"] },
      { id: "materials", label: "Materials you handle", type: "text", max: 200, help: "For example plastic, metal, paper or glass." },
    ],
  },
  {
    id: "business", label: "Recycling Business Members", org: true,
    summary: "Micro, small and medium recycling enterprises, material recovery businesses, processors and aggregators.",
    fields: [
      { id: "businessType", label: "Type of business", type: "select", required: true,
        options: ["Plastic, metal, paper, glass or other material recovery", "Recycling processor or aggregator", "Waste collection and resource recovery"] },
      { id: "registrationStatus", label: "Registration status", type: "select", required: true, options: ["Registered business", "Not yet registered"] },
      registration,
      { id: "materials", label: "Materials you handle", type: "text", max: 200 },
      { id: "description", label: "Briefly describe your operations", type: "textarea", max: 800 },
    ],
  },
  {
    id: "cooperative", label: "Cooperative Members", org: true,
    summary: "Registered cooperatives operating in the waste and recycling sector, including thrift and multipurpose societies.",
    fields: [
      { id: "cooperativeType", label: "Type of cooperative", type: "select", required: true,
        options: ["Waste sector thrift cooperative society", "Waste sector multipurpose cooperative society"] },
      { id: "registrationStatus", label: "Registration status", type: "select", required: true, options: ["Registered cooperative", "Not yet registered"] },
      registration,
      { id: "description", label: "Briefly describe your cooperative's activities", type: "textarea", max: 800 },
    ],
  },
  {
    id: "institutional", label: "Institutional Members", org: true,
    summary: "Non-governmental, community based and environmental organisations whose work aligns with ASWRA's objectives.",
    fields: [
      { id: "institutionType", label: "Type of institution", type: "select", required: true,
        options: ["Non-governmental organisation", "Community based organisation", "Environmental organisation", "Other institution"] },
      registration,
      { id: "alignment", label: "How do your activities align with ASWRA's objectives?", type: "textarea", required: true, max: 1000 },
    ],
  },
  {
    id: "partner", label: "Strategic and Corporate Partners", org: true,
    summary: "Recycling companies and off takers, producers and extended producer responsibility participants, private sector supporters and development partners.",
    fields: [
      { id: "partnerType", label: "Type of organisation", type: "select", required: true,
        options: ["Recycling company or material off taker", "Producer or extended producer responsibility participant", "Private sector organisation supporting responsible waste management", "Development partner", "Other eligible institution"] },
      registration,
      { id: "partnershipInterest", label: "How would you like to work with ASWRA?", type: "textarea", required: true, max: 1000 },
    ],
  },
];

export const DECLARATION =
  "I declare that the information I have supplied is true and accurate to the best of my knowledge. I confirm that I have read, or have had explained to me, the ASWRA membership requirements, benefits and Code of Conduct, and I undertake to comply with the ASWRA Constitution, approved policies, lawful directives and applicable laws. I understand that membership benefits and participation in specific programmes are subject to eligibility, programme availability and applicable rules.";

export const PRIVACY_CONSENT =
  "I have read the privacy notice and I agree that ASWRA may use the information in this form to process my membership application and to contact me about it.";
