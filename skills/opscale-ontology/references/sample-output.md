# Sample output — opscale-ontology

Excerpt of `docs/plan/ontology.mmd` + `docs/plan/ontology.txt` for the same
**recruitment** module used by the samples of the other Plan skills
(see `opscale-sipoc/references/sample-output.md`): every Logic shown here has
a block in `sipoc.txt`, every entity named in a CRUD exists in `dbml.txt`,
every step appears in `process.txt` and `bpmn.txt`.

Shows the SHAPE, not the full module (excerpt: first subprocess + the start
of the second).

---

Format rules the excerpt demonstrates:

- `treeView-beta` header first; `%%` metadata lines next (module chain with
  the project id `xxx/yyy`, one `entity` line per stamped table of
  `dbml.dbml`, one `external` line per external-refs slug); then the tree —
  4-space indentation, quoted labels, `/` suffix on nodes with children.
- **Every node label opens with its ontology id**: `SP-XX` (subprocess),
  `SP-XX-YY` (step), the operation oid `SP-XX-YY-[C|L|O]ZZ` (nested
  `…-[C|L|O]AA` on composed CRUDs).
- Category emojis: `⏳` subprocess, `⚙️` Logic (bare kebab Action id +
  `[BR-NN]` badges), `📝` CRUD (`{action} {entity}`), `📩` Output (brief
  content, never a channel). Steps and the top three levels carry no emoji.
- CRUDs composed inside a Logic are children of the `⚙️` node — mirroring
  the indented cruds of `bpmn.txt`, never duplicated at step level.
- `ontology.txt` is the same tree as a plain outline: 2-space indent,
  category words instead of emojis.

## docs/plan/ontology.mmd (excerpt)

```
treeView-beta
%% module: people/recruitment | domain: People (people) | software: Acme HR Suite
%% entity: requisition | Requisition | position request, vacancy request, req | requisition | RequisitionStatus
%% entity: candidate | Candidate | applicant, prospect | candidate | CandidateStatus
%% entity: posting | Opening | job posting, publication, ad | posting | —
%% entity: offer | Offer | proposal, offer letter | offer | OfferStatus
%% external: ref:users | requested_by, hiring_manager_id
    "Acme HR Suite"/
        "People"/
            "Recruitment"/
                "⏳ SP-01 Position requisition"/
                    "SP-01-01 Describe the requested position"/
                        "📝 SP-01-01-C01 create requisition"
                    "SP-01-02 Route the approval chain"/
                        "⚙️ SP-01-02-L01 route-approval [BR-01]"/
                            "📝 SP-01-02-L01-C01 read requisition"
                            "📝 SP-01-02-L01-C02 create approval"
                    "SP-01-03 Record each approval decision"/
                        "⚙️ SP-01-03-L01 approve-requisition [BR-02]"/
                            "📝 SP-01-03-L01-C01 update approval"
                            "📝 SP-01-03-L01-C02 update requisition"
                            "📩 SP-01-03-L01-O01 approval notice to the requester"
                        "⚙️ SP-01-03-L02 reject-requisition [BR-02]"/
                            "📝 SP-01-03-L02-C01 update approval"
                            "📝 SP-01-03-L02-C02 update requisition"
                            "📩 SP-01-03-L02-O01 rejection notice to the requester"
                "⏳ SP-02 Job posting"/
                    "SP-02-01 Notify internal employees"/
                        "⚙️ SP-02-01-L01 announce-opening [BR-04]"/
                            "📝 SP-02-01-L01-C01 read requisition"
                            "📩 SP-02-01-L01-O01 opening announcement to employees"
                    "SP-02-02 Publish the opening with tracked links"/
                        "⚙️ SP-02-02-L01 publish-requisition [BR-03]"/
                            "📝 SP-02-02-L01-C01 read requisition"
                            "📝 SP-02-02-L01-C02 create posting"
```

## docs/plan/ontology.txt (same excerpt)

```
Acme HR Suite
  People
    Recruitment
      SP-01 Position requisition
        SP-01-01 Describe the requested position
          SP-01-01-C01 crud: create requisition
        SP-01-02 Route the approval chain
          SP-01-02-L01 logic: route-approval
            SP-01-02-L01-C01 crud: read requisition
            SP-01-02-L01-C02 crud: create approval
        SP-01-03 Record each approval decision
          SP-01-03-L01 logic: approve-requisition
            SP-01-03-L01-C01 crud: update approval
            SP-01-03-L01-C02 crud: update requisition
            SP-01-03-L01-O01 output: approval notice to the requester
          SP-01-03-L02 logic: reject-requisition
            SP-01-03-L02-C01 crud: update approval
            SP-01-03-L02-C02 crud: update requisition
            SP-01-03-L02-O01 output: rejection notice to the requester
      SP-02 Job posting
        SP-02-01 Notify internal employees
          SP-02-01-L01 logic: announce-opening
            SP-02-01-L01-C01 crud: read requisition
            SP-02-01-L01-O01 output: opening announcement to employees
        SP-02-02 Publish the opening with tracked links
          SP-02-02-L01 logic: publish-requisition
            SP-02-02-L01-C01 crud: read requisition
            SP-02-02-L01-C02 crud: create posting
```
