// Example program every new account starts from (Push Pull Legs, 3 days).
export const TEMPLATE = {
  title: "Push Pull Legs",
  warm: [
    {id: "w1", n: "Mountain climber", s: ["15-30", "15-30"]},
    {id: "w2", n: "Crunch", s: ["15-30", "15-30", "15-30"]},
    {id: "w3", n: "Alzate gambe alle parallele", s: ["15-30", "15-30", "15-30"]}
  ],
  days: [
    {id: "pull", name: "Pull", sub: "Dorso e bicipiti", ex: [
      {id: "p1", n: "Lat machine avanti", s: ["10", "10", "8", "8"], note: "Rec. 2'"},
      {id: "p2", n: "Pulley basso", s: ["8", "8", "8", "8"], note: "Rec. 2'"},
      {id: "p3", n: "Pull down", s: ["10", "10", "10"], note: "Rec. 90\""},
      {id: "p4", n: "Rematore con manubrio", s: ["10", "10", "10"], note: "per braccio · Rec. 90\""},
      {id: "p5", n: "Curl bicipiti con manubri", s: ["10", "10", "8", "8"], note: "Rec. 90\""},
      {id: "p6", n: "Curl a martello", s: ["8", "8", "8"], note: "Rec. 90\""}
    ]},
    {id: "push", name: "Push", sub: "Petto, spalle e tricipiti", ex: [
      {id: "u1", n: "Chest press", s: ["10", "10", "8", "8"], note: "Rec. 2'"},
      {id: "u2", n: "Croci su panca inclinata", s: ["8", "8", "8", "8"], note: "Rec. 2'"},
      {id: "u3", n: "Panca con manubri", s: ["10", "10", "10"], note: "Rec. 90\""},
      {id: "u4", n: "Lento con manubri", s: ["10", "10", "8", "8"], note: "Rec. 90\""},
      {id: "u5", n: "Alzate laterali", s: ["8", "8", "8", "8"], note: "Rec. 90\""},
      {id: "u6", n: "Tricipiti ai cavi", s: ["10", "10", "8", "8"], note: "Rec. 90\""},
      {id: "u7", n: "Panca stretta per tricipiti", s: ["8", "8", "8"], note: "Rec. 90\""}
    ]},
    {id: "legs", name: "Legs", sub: "Gambe", ex: [
      {id: "l1", n: "Pressa", s: ["8", "8", "8", "8"], note: "Rec. 2'"},
      {id: "l2", n: "Affondi con manubri", s: ["10", "10", "10"], note: "per gamba · Rec. 2'"},
      {id: "l3", n: "Leg extension", s: ["10", "10", "8", "8"], note: "Rec. 90\""},
      {id: "l4", n: "Leg curl", s: ["8", "8", "8", "8"], note: "Rec. 90\""},
      {id: "l5", n: "Calf monopodalico", s: ["15", "15", "15"], note: "per gamba · Rec. 90\""}
    ]}
  ]
};
