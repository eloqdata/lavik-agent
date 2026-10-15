// Exact article editions covered by the October editorial publication.
// Independent of mutable review-record flags; new articles use normal publication.
export const editorialRecord = "evidence/editorial/site-review-20261014.json";
export const editorialInventory: Record<
  string,
  { contentHash: string; kind: "inherited" | "revised" }
> = {
  "en:capacity-use-case": {
    contentHash:
      "a49cfb321e74cad100a3c580286f765b622de7f60441fdb686a2bbc83ac48c78",
    kind: "inherited",
  },
  "en:compatibility": {
    contentHash:
      "31adb45f9f403edc2fa3f055594f626d85be513698d82712b9c5bfe3b5363d49",
    kind: "inherited",
  },
  "en:evaluation-faq": {
    contentHash:
      "88fbb51fa5d30dfdebc26d50b3e1597d34ca1658496c30993c0a8fe643d0213e",
    kind: "inherited",
  },
  "en:failover-intent-authority-and-evidence": {
    contentHash:
      "52ba500b45e98cd2fcb43f4ab1509f27b277bbe1b0fbd901274136ce262844dc",
    kind: "inherited",
  },
  "en:fast-restart-with-index-checkpoints": {
    contentHash:
      "d653e52f5aa3a2bcee7c6f8bf6edaf21a3ff88e05b2bb275d680aca36b37a87b",
    kind: "inherited",
  },
  "en:grouped-collections-on-ssd": {
    contentHash:
      "d1bddc324b96db3cd1058ca7cb8aa2b6bc5e7080e4faebceaf1a5142923a3501",
    kind: "inherited",
  },
  "en:inside-lavik-request-path": {
    contentHash:
      "cf741d676a25b393321492e23f9e40f6879f00736c2e30faa5fd968cbaf8c3a1",
    kind: "inherited",
  },
  "en:lavik-0-1-0-released": {
    contentHash:
      "4cca09359946e5e066006f85f460d735263db2ad053ded8814cc0394ab52ba49",
    kind: "revised",
  },
  "en:lavik-field-notes-2026-09-26": {
    contentHash:
      "a842832e63140e40093f7827885939e70191d899fa321d0d07f6c729960d925d",
    kind: "inherited",
  },
  "en:lavik-field-notes-2026-09-28": {
    contentHash:
      "584e00b6a01cc72e61dcc7174c38c0631f11cffd1236ab6ebe91117d35993668",
    kind: "inherited",
  },
  "en:lavik-field-notes-2026-09-30": {
    contentHash:
      "431bbdd660598c6f3fdbd494de5f1797b296176e6c792443482958327540fe6e",
    kind: "inherited",
  },
  "en:lavik-field-notes-2026-10-02": {
    contentHash:
      "f1dc8b14c0bab5a1948aaaf1ddc3bd7d3eac35954562bdabfa0060b0a214e4bb",
    kind: "inherited",
  },
  "en:lavik-field-notes-2026-10-04": {
    contentHash:
      "290e264ea644e1999bd55e8ac574d3cb5e47293c5e2e9f9d95dc6e4af9de702d",
    kind: "inherited",
  },
  "en:lavik-field-notes-2026-10-06": {
    contentHash:
      "6c6fcd48042b33274521e8cced8ba6a40e2bab867c9e49428068e9f3bb9dce74",
    kind: "inherited",
  },
  "en:lavik-field-notes-2026-10-08": {
    contentHash:
      "fc173ac8768f6ed1b633ffb1c5f2a2643eb04f046f699460806b708ce3b3e57d",
    kind: "inherited",
  },
  "en:lavik-field-notes-2026-10-10": {
    contentHash:
      "93ad3f1b4d6cb94a488805ba517c127b66cb086e71acbb6351528f556b17c6e3",
    kind: "inherited",
  },
  "en:lavik-field-notes-2026-10-12": {
    contentHash:
      "5218811a92ed2409f00ad0f79d4b0a08eb3977745753096d3a226954f99b662b",
    kind: "inherited",
  },
  "en:lavik-field-notes-2026-10-14": {
    contentHash:
      "1aa324724f93f2b55315d108bd45c9bf136c17f108b4e167bc9f505a40b57932",
    kind: "revised",
  },
  "en:lavik-spdk-performance-and-capacity": {
    contentHash:
      "cd3a78c32c6cebe6e96016810fdbe76227d9bc6a9769396df19b41cc80e0c9b0",
    kind: "inherited",
  },
  "en:lua-functions-as-a-durable-catalog": {
    contentHash:
      "664428b28843036d2f883161bf9850cc842ee8e5c9fb0a71be72ec3a433797f1",
    kind: "inherited",
  },
  "en:multi-key-transactions-across-partitions": {
    contentHash:
      "71f290739e90d1c1eacacc2c6dc17a2039545508e26c832fd1372317be61d0f1",
    kind: "inherited",
  },
  "en:overview": {
    contentHash:
      "7eb320f7d71214002434ceaac3f4945f42f50f38d4f42c8afe3655a92ffeac01",
    kind: "inherited",
  },
  "en:quick-start": {
    contentHash:
      "32e0b996c18b9a9860dbd46ace96ded10d9e3ba6fc6c2a8aee84d5e0a399d466",
    kind: "inherited",
  },
  "en:reading-benchmarks": {
    contentHash:
      "dd5390f9431773f2ff70d39d9fdf310f2edaa2336697c099480917ac409944e4",
    kind: "inherited",
  },
  "en:release-0-1-0": {
    contentHash:
      "06fcbe2599cdcfe960045664a769c12357309a1259f8c12dc3a13a18aef2a7f9",
    kind: "inherited",
  },
  "en:replication-acks-and-recovery-boundaries": {
    contentHash:
      "3e757064ac0638d54020af1f92fc26dec14232aff4cb5bca7c80940e1afe834b",
    kind: "inherited",
  },
  "en:storage": {
    contentHash:
      "90ff9934005fb36a7d754d89f256184bf1d18ce676e01d3da28fa59993671585",
    kind: "inherited",
  },
  "en:why-lavik-separates-index-from-values": {
    contentHash:
      "800ea8e018d05c2bf9bf3a43dfa8fc7b833e5124a61469930df48c4a20b6930c",
    kind: "inherited",
  },
  "zh-CN:capacity-use-case": {
    contentHash:
      "a16a36928e76317398736ea2b745f85027cc5a0b7f5fc6f65f0aad53c2c8baa6",
    kind: "inherited",
  },
  "zh-CN:compatibility": {
    contentHash:
      "bca4613d6add8c80dabb9be785d4740042f3d7988441a460924f19f46608c727",
    kind: "inherited",
  },
  "zh-CN:evaluation-faq": {
    contentHash:
      "ddbc34d274a8541c09c4d174da3a4afb75f281e9b85ad4f592b12c479777f475",
    kind: "inherited",
  },
  "zh-CN:failover-intent-authority-and-evidence": {
    contentHash:
      "d8ee2b30a09589987fb40aac559c33c673cbe28759c47b7c24e7ffc9bcd9e901",
    kind: "inherited",
  },
  "zh-CN:fast-restart-with-index-checkpoints": {
    contentHash:
      "cc81dd38f3f8f361ee6de58e8292a5dba73cfb0e7fdaead0f6193f345beb1a9e",
    kind: "inherited",
  },
  "zh-CN:grouped-collections-on-ssd": {
    contentHash:
      "340cbf12d39f8ea7456c808ab7b2bc7a9c3eca4ba2dca57b83545fff2101e6fb",
    kind: "inherited",
  },
  "zh-CN:inside-lavik-request-path": {
    contentHash:
      "455cd58eacb5612c92b51dd58f7a62c05664b7751d0ec1d6dfb9e84b74279257",
    kind: "inherited",
  },
  "zh-CN:lavik-0-1-0-released": {
    contentHash:
      "8e02d85f8341d7bc7634e6868c9b6839057149eab2cae2afaeb166d21af4b1a5",
    kind: "revised",
  },
  "zh-CN:lavik-field-notes-2026-09-26": {
    contentHash:
      "9d238f6b27d06f0f86c8add1fd31f114aa3d24745522292b6057bb898f66b09f",
    kind: "inherited",
  },
  "zh-CN:lavik-field-notes-2026-09-28": {
    contentHash:
      "654a18616e6e05add60ea6812faa082ba2c9ca249bfc1da7c71f97eaae1bb863",
    kind: "inherited",
  },
  "zh-CN:lavik-field-notes-2026-09-30": {
    contentHash:
      "bea8d0a9a5997fd43f5bbd449132dd89e3903683f9cd8dca950df49eea73691c",
    kind: "inherited",
  },
  "zh-CN:lavik-field-notes-2026-10-02": {
    contentHash:
      "d7cb412b9a07c412b5ee156e23db8971436180e04c565652563e4c79c704730f",
    kind: "inherited",
  },
  "zh-CN:lavik-field-notes-2026-10-04": {
    contentHash:
      "968f52d0f0964de35fcc6e30425a387754d0ed58b0d501071b72840c28f5fd17",
    kind: "inherited",
  },
  "zh-CN:lavik-field-notes-2026-10-06": {
    contentHash:
      "260e09bb8eab3dac66ffda5187d965cb2c84d7ec1224f39415abe400225d3c2f",
    kind: "inherited",
  },
  "zh-CN:lavik-field-notes-2026-10-08": {
    contentHash:
      "9a06c212991f9388bd321b09a7e1e0238b2007b357a7c6657c21d7d6eb46dc18",
    kind: "inherited",
  },
  "zh-CN:lavik-field-notes-2026-10-10": {
    contentHash:
      "0e4a0214f40c67cac48e150f18122608dcc21fd6437053af9d9a9ec29eb5f578",
    kind: "inherited",
  },
  "zh-CN:lavik-field-notes-2026-10-12": {
    contentHash:
      "77ebc2a78d874df9eaad60d0ffe58f9d073aac7e30d4877405f46f82dc0487d1",
    kind: "inherited",
  },
  "zh-CN:lavik-field-notes-2026-10-14": {
    contentHash:
      "96d445d9a6d850a9b130a8b9084e4231b5219c08ce36fafced2d446e7b4cd0f2",
    kind: "revised",
  },
  "zh-CN:lavik-spdk-performance-and-capacity": {
    contentHash:
      "56989b67f1b007cae792ec486d0043e063c6cf3099de7452db942ec679c8d3b1",
    kind: "inherited",
  },
  "zh-CN:lua-functions-as-a-durable-catalog": {
    contentHash:
      "e36d04e228084371ed47119d275b913f290b5760b713d79ac4c80dfccc720bd5",
    kind: "inherited",
  },
  "zh-CN:multi-key-transactions-across-partitions": {
    contentHash:
      "4f8c38219fd2fb142db6aeaf164e2857cfdeef9f282143076f7cc71c6df5dfa0",
    kind: "inherited",
  },
  "zh-CN:overview": {
    contentHash:
      "1d3f3bf928f6ca9c86edc731221e203c4a3c94d411c0fa4d6645cddc5462fdb8",
    kind: "inherited",
  },
  "zh-CN:quick-start": {
    contentHash:
      "806e4930e86cc0fc3aea086e1669ea2d8fa934f8a08b2c1ee6e0fd7e2ac9c55b",
    kind: "inherited",
  },
  "zh-CN:reading-benchmarks": {
    contentHash:
      "34d766a5438beb15c7cd0945536213f36bfd09002460069ba299bdf3777b84dc",
    kind: "inherited",
  },
  "zh-CN:release-0-1-0": {
    contentHash:
      "be10f126f0018034140ef36bf64ae863897e112bddebb0023fca8ba86606fd21",
    kind: "inherited",
  },
  "zh-CN:replication-acks-and-recovery-boundaries": {
    contentHash:
      "dafc4723cd8c49e02414533f12f584c7da7217b5c2c905618fb9481f5264d868",
    kind: "inherited",
  },
  "zh-CN:storage": {
    contentHash:
      "bce1e1eebf946a6bc07df61b3fce459f7b7262d546f1bb1c157998cd6f84fc17",
    kind: "inherited",
  },
  "zh-CN:why-lavik-separates-index-from-values": {
    contentHash:
      "ea428364555a2e46f3cffea3d8e8688ce8249f5cb1e8d9cbd1dc165f922b2ef2",
    kind: "inherited",
  },
};
