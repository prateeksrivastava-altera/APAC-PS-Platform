-- ApacWbsApp: PostgreSQL seed data
-- Executed by DatabaseInitializer immediately after Schema.sql on fresh installs.

-- Resources (IDs 1..7) ---------------------------------------------------
INSERT INTO Resources (ResourceId, RoleName, ShortCode, DisplayOrder) VALUES
    (1, 'Project Manager',          'PM',   10),
    (2, 'Implementation Consultant','IC',   20),
    (3, 'Systems Engineer',         'SE',   30),
    (4, 'Integration Engineer',     'INT',  40),
    (5, 'Clinical SME',             'CLIN', 50),
    (6, 'Training',                 'TRN',  60),
    (7, 'Testing',                  'TEST', 70)
ON CONFLICT DO NOTHING;

-- Template 1: Sunrise EHR — Standard Module Deployment ------------------
INSERT INTO WbsTemplates (TemplateId, TemplateName, Description) VALUES
    (1, 'Sunrise EHR — Standard Module Deployment',
        'Generic phase-based WBS covering scoping, build, test and go-live for a standard Sunrise clinical module deployment.')
ON CONFLICT DO NOTHING;

-- Phases under template 1 (Depth 1)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (1, 1, NULL, 1, 1, 'Project Initiation',     FALSE, NULL),
    (2, 1, NULL, 2, 1, 'Design & Scoping',       FALSE, NULL),
    (3, 1, NULL, 3, 1, 'Build & Configuration',  FALSE, NULL),
    (4, 1, NULL, 4, 1, 'Testing',                FALSE, NULL),
    (5, 1, NULL, 5, 1, 'Go-Live & Hypercare',    FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 2 under Project Initiation (parent 1)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (6, 1, 1, 1, 2, 'Kickoff Meeting',           FALSE, '{"PM":4,"IC":4,"SE":2}'),
    (7, 1, 1, 2, 2, 'Stakeholder Identification',FALSE, '{"PM":8,"IC":4}'),
    (8, 1, 1, 3, 2, 'Project Charter',           FALSE, '{"PM":12}')
ON CONFLICT DO NOTHING;

-- Depth 2 under Design & Scoping (parent 2)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (9,  1, 2, 1, 2, 'Requirements Workshops', FALSE, '{"PM":8,"IC":24,"CLIN":16}'),
    (10, 1, 2, 2, 2, 'Integration Design',     TRUE,  '{"IC":16,"SE":16,"INT":24}')
ON CONFLICT DO NOTHING;

-- Depth 3 under Requirements Workshops (parent 9)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (11, 1, 9, 1, 3, 'Clinical Workflow Mapping', FALSE, '{"IC":12,"CLIN":12}'),
    (12, 1, 9, 2, 3, 'Build Spec Authoring',      FALSE, '{"IC":16}')
ON CONFLICT DO NOTHING;

-- Depth 3 under Integration Design (parent 10)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (13, 1, 10, 1, 3, 'HL7 ADT Interface Spec', TRUE, '{"IC":8,"INT":12}'),
    (14, 1, 10, 2, 3, 'HL7 ORU Interface Spec', TRUE, '{"IC":8,"INT":12}'),
    (15, 1, 10, 3, 3, 'API Contracts Review',   TRUE, '{"IC":4,"INT":8}')
ON CONFLICT DO NOTHING;

-- Depth 2 under Build & Configuration (parent 3)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (16, 1, 3, 1, 2, 'Environment Provisioning',    FALSE, '{"SE":24,"INT":8}'),
    (17, 1, 3, 2, 2, 'Module Configuration',        TRUE,  '{"IC":80}'),
    (18, 1, 3, 3, 2, 'Interface Build',             TRUE,  '{"INT":60,"SE":20}'),
    (19, 1, 3, 4, 2, 'Training Material Authoring', TRUE,  '{"TRN":40,"IC":12}')
ON CONFLICT DO NOTHING;

-- Depth 2 under Testing (parent 4)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (20, 1, 4, 1, 2, 'Unit Testing',           TRUE,  '{"IC":24,"TEST":24}'),
    (21, 1, 4, 2, 2, 'Integration Testing',    FALSE, '{"IC":24,"TEST":32,"INT":16}'),
    (22, 1, 4, 3, 2, 'User Acceptance Testing',FALSE, '{"PM":8,"IC":16,"TEST":24,"CLIN":24}')
ON CONFLICT DO NOTHING;

-- Depth 2 under Go-Live & Hypercare (parent 5)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (23, 1, 5, 1, 2, 'End-User Training',   TRUE,  '{"TRN":40,"IC":8}'),
    (24, 1, 5, 2, 2, 'Cutover',             FALSE, '{"PM":16,"IC":24,"SE":12,"INT":12}'),
    (25, 1, 5, 3, 2, 'Hypercare (2 weeks)', FALSE, '{"PM":40,"IC":80,"SE":16,"INT":16}')
ON CONFLICT DO NOTHING;

-- Template 2: HL7 Integration — Lightweight Build -----------------------
INSERT INTO WbsTemplates (TemplateId, TemplateName, Description) VALUES
    (2, 'HL7 Integration — Lightweight Build',
        'Focused WBS for delivering a single HL7 v2.x interface (ADT or ORU) without broader Sunrise module work.')
ON CONFLICT DO NOTHING;

INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (26, 2, NULL, 1, 1, 'Interface Design',             FALSE, NULL),
    (27, 2, NULL, 2, 1, 'Interface Build',              FALSE, NULL),
    (28, 2, NULL, 3, 1, 'Interface Testing & Cutover',  FALSE, NULL),

    (29, 2, 26, 1, 2, 'Message Specification Workshop', FALSE, '{"IC":8,"INT":8}'),
    (30, 2, 26, 2, 2, 'Field Mapping Document',         FALSE, '{"IC":12,"INT":16}'),

    (31, 2, 27, 1, 2, 'Inbound Channel Build',          TRUE,  '{"INT":24}'),
    (32, 2, 27, 2, 2, 'Outbound Channel Build',         TRUE,  '{"INT":24}'),

    (33, 2, 28, 1, 2, 'Connectivity Testing',           FALSE, '{"INT":8,"SE":4}'),
    (34, 2, 28, 2, 2, 'End-to-End Testing',             FALSE, '{"IC":12,"INT":12,"TEST":16}'),
    (35, 2, 28, 3, 2, 'Production Cutover',             FALSE, '{"PM":4,"IC":4,"INT":8,"SE":4}')
ON CONFLICT DO NOTHING;

-- Template 3: Altera Standard Implementation --------------------------------
INSERT INTO WbsTemplates (TemplateId, TemplateName, Description) VALUES
    (3, 'Altera Standard Implementation',
        'Full project lifecycle WBS for a standard Altera implementation: Initiate, Design, Build, Activate, Close, and Project Management.')
ON CONFLICT DO NOTHING;

-- Depth 1: phases (IDs 36-43)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (36, 3, NULL, 1, 1, 'Initiate',                                                   FALSE, NULL),
    (37, 3, NULL, 2, 1, 'Design',                                                     FALSE, NULL),
    (38, 3, NULL, 3, 1, 'Build',                                                      FALSE, NULL),
    (39, 3, NULL, 4, 1, 'Activate',                                                   FALSE, NULL),
    (40, 3, NULL, 5, 1, 'Close',                                                      FALSE, NULL),
    (41, 3, NULL, 6, 1, 'Additional Project Management',                              FALSE, NULL),
    (42, 3, NULL, 7, 1, 'Additional Scope - OPTIONAL $$ - DELETE IF NOT REQUIRED',   FALSE, NULL),
    (43, 3, NULL, 8, 1, 'Lessons Learned - OPTIONAL $$ - DELETE IF NOT REQUIRED',    FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 2 under Initiate (parent 36, IDs 44-47)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (44, 3, 36, 1, 2, 'Internal kick-off',    FALSE, NULL),
    (45, 3, 36, 2, 2, 'Initial planning',     FALSE, NULL),
    (46, 3, 36, 3, 2, 'PMP',                  FALSE, NULL),
    (47, 3, 36, 4, 2, 'Documentation Review', FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 3 under Initial planning (parent 45, IDs 48-50)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (48, 3, 45, 1, 3, 'Review Lessons Learned',           FALSE, NULL),
    (49, 3, 45, 2, 3, 'Client kick-off meeting planning', FALSE, NULL),
    (50, 3, 45, 3, 3, 'Client kick-off meeting',          FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 3 under PMP (parent 46, IDs 51-58)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (51, 3, 46, 1, 3, 'Overview, scope, objectives, approach',      FALSE, NULL),
    (52, 3, 46, 2, 3, 'Schedule & Milestones',                      FALSE, NULL),
    (53, 3, 46, 3, 3, 'Assumptions & Constraints / RAID registers', FALSE, NULL),
    (54, 3, 46, 4, 3, 'Roles & Responsibilities',                   FALSE, NULL),
    (55, 3, 46, 5, 3, 'Controls, Comms & Quality Plan',             FALSE, NULL),
    (56, 3, 46, 6, 3, 'Client Review',                              FALSE, NULL),
    (57, 3, 46, 7, 3, 'Manage Approvals',                           FALSE, NULL),
    (58, 3, 46, 8, 3, 'Workshop scheduling',                        FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 2 under Design (parent 37, IDs 59-60)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (59, 3, 37, 1, 2, 'Stakeholder Engagement/Workshops', FALSE, NULL),
    (60, 3, 37, 2, 2, 'Design Document',                  FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 3 under Stakeholder Engagement/Workshops (parent 59, IDs 61-66)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (61, 3, 59, 1, 3, 'Workshop preparation',                         FALSE, NULL),
    (62, 3, 59, 2, 3, 'WS1 - Current state review - functional',      FALSE, NULL),
    (63, 3, 59, 3, 3, 'WS2 - Current state review - technical',       FALSE, NULL),
    (64, 3, 59, 4, 3, 'WS3 - Future state confirmation - functional', FALSE, NULL),
    (65, 3, 59, 5, 3, 'WS4 - Future state confirmation - technical',  FALSE, NULL),
    (66, 3, 59, 6, 3, 'Evaluation & Clarifications',                  FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 3 under Design Document (parent 60, IDs 67-76)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (67, 3, 60,  1, 3, 'Draft version',                          FALSE, NULL),
    (68, 3, 60,  2, 3, 'Solution Design / Confirm future state', FALSE, NULL),
    (69, 3, 60,  3, 3, 'Implementation Plan',                    FALSE, NULL),
    (70, 3, 60,  4, 3, 'Environment Management',                 FALSE, NULL),
    (71, 3, 60,  5, 3, 'Test Approach',                          FALSE, NULL),
    (72, 3, 60,  6, 3, 'Training Plan',                          FALSE, NULL),
    (73, 3, 60,  7, 3, 'Confirm schedule',                       FALSE, NULL),
    (74, 3, 60,  8, 3, 'Internal Review / QA',                   FALSE, NULL),
    (75, 3, 60,  9, 3, 'Client Review & Feedback',               FALSE, NULL),
    (76, 3, 60, 10, 3, 'Final Version',                          FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 4 under Final Version (parent 76, IDs 77-79)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (77, 3, 76, 1, 4, 'Incorporate Feedback',  FALSE, NULL),
    (78, 3, 76, 2, 4, 'Internal Review / QA',  FALSE, NULL),
    (79, 3, 76, 3, 4, 'Finalise & Deliver',    FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 2 under Build (parent 38, IDs 80-83)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (80, 3, 38, 1, 2, 'Environments',  FALSE, NULL),
    (81, 3, 38, 2, 2, 'Integration',   FALSE, NULL),
    (82, 3, 38, 3, 2, 'Configuration', FALSE, NULL),
    (83, 3, 38, 4, 2, 'Testing',       FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 3 under Environments (parent 80, IDs 84-87)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (84, 3, 80, 1, 3, 'Provision DEV environment',   FALSE, NULL),
    (85, 3, 80, 2, 3, 'Provision TEST environment',  FALSE, NULL),
    (86, 3, 80, 3, 3, 'Provision PROD environment',  FALSE, NULL),
    (87, 3, 80, 4, 3, 'Provision TRAIN environment', FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 3 under Integration (parent 81, IDs 88-90)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (88, 3, 81, 1, 3, 'Integration design & specification', FALSE, NULL),
    (89, 3, 81, 2, 3, 'Integration build & unit test',      TRUE,  NULL),
    (90, 3, 81, 3, 3, 'Integration validation',             FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 3 under Configuration (parent 82, IDs 91-94)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (91, 3, 82, 1, 3, 'DEV Configuration',   FALSE, NULL),
    (92, 3, 82, 2, 3, 'TEST Configuration',  FALSE, NULL),
    (93, 3, 82, 3, 3, 'PROD Configuration',  FALSE, NULL),
    (94, 3, 82, 4, 3, 'TRAIN Configuration', FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 3 under Testing (parent 83, IDs 95-101)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (95,  3, 83, 1, 3, 'System Integration Testing (SIT) & defects/issues resolution',        FALSE, NULL),
    (96,  3, 83, 2, 3, 'Regression Testing & Validation Testing & defects/issues resolution', FALSE, NULL),
    (97,  3, 83, 3, 3, 'Performance Testing & defects/issues resolution - OPTIONAL',          FALSE, NULL),
    (98,  3, 83, 4, 3, 'UAT Cycle 1',                                                         FALSE, NULL),
    (99,  3, 83, 5, 3, 'UAT Cycle 2',                                                         FALSE, NULL),
    (100, 3, 83, 6, 3, 'Regression Testing defect resolution',                                FALSE, NULL),
    (101, 3, 83, 7, 3, 'Update documentation',                                                FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 4 under UAT Cycle 1 (parent 98, IDs 102-103)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (102, 3, 98, 1, 4, 'Execute UAT',               FALSE, NULL),
    (103, 3, 98, 2, 4, 'Defect & issue resolution', FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 4 under UAT Cycle 2 (parent 99, IDs 104-105)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (104, 3, 99, 1, 4, 'Execute UAT',               FALSE, NULL),
    (105, 3, 99, 2, 4, 'Defect & issue resolution', FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 2 under Activate (parent 39, IDs 106-108)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (106, 3, 39, 1, 2, 'Training - OPTIONAL',           FALSE, NULL),
    (107, 3, 39, 2, 2, 'Pre-Activation - Dry Run etc.', FALSE, NULL),
    (108, 3, 39, 3, 2, 'Activation',                    FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 3 under Training - OPTIONAL (parent 106, IDs 109-110)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (109, 3, 106, 1, 3, 'Super User training', FALSE, NULL),
    (110, 3, 106, 2, 3, 'End User Training',   FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 3 under Pre-Activation - Dry Run etc. (parent 107, IDs 111-113)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (111, 3, 107, 1, 3, 'Dry Run 1',                    FALSE, NULL),
    (112, 3, 107, 2, 3, 'Dry Run 2',                    FALSE, NULL),
    (113, 3, 107, 3, 3, 'Activation Go/No Go decision', FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 3 under Activation (parent 108, IDs 114-117)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (114, 3, 108, 1, 3, 'Go-live',                                                           FALSE, NULL),
    (115, 3, 108, 2, 3, 'Validation Testing',                                                FALSE, NULL),
    (116, 3, 108, 3, 3, 'Production Verification Testing (PVT)',                             FALSE, NULL),
    (117, 3, 108, 4, 3, 'Hypercare, post upgrade/migration support & transition to support', FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 2 under Close (parent 40, IDs 118-119)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (118, 3, 40, 1, 2, 'Transition to Support', FALSE, NULL),
    (119, 3, 40, 2, 2, 'Project Close',          FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 3 under Transition to Support (parent 118, IDs 120-121)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (120, 3, 118, 1, 3, 'Update documentation - Technical Workbook, Implementation Plan', FALSE, NULL),
    (121, 3, 118, 2, 3, 'Transition to Support handover',                                  FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 3 under Project Close (parent 119, ID 122)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (122, 3, 119, 1, 3, 'Project close', FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 2 under Additional Project Management (parent 41, ID 123)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (123, 3, 41, 1, 2, 'Project Management', FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 3 under Project Management (parent 123, IDs 124-131)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (124, 3, 123, 1, 3, 'Internal weekly project meetings',  FALSE, NULL),
    (125, 3, 123, 2, 3, 'Client weekly project meetings',    FALSE, NULL),
    (126, 3, 123, 3, 3, 'Governance meetings - fortnightly', FALSE, NULL),
    (127, 3, 123, 4, 3, 'RAID Review (monthly)',             FALSE, NULL),
    (128, 3, 123, 5, 3, 'Schedule Review meeting (weekly)',  FALSE, NULL),
    (129, 3, 123, 6, 3, 'Status reports (weekly)',           FALSE, NULL),
    (130, 3, 123, 7, 3, 'Budgeting (monthly)',               FALSE, NULL),
    (131, 3, 123, 8, 3, 'Daily huddles - UAT',               FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 2 under Lessons Learned - OPTIONAL (parent 43, IDs 132-133)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (132, 3, 43, 1, 2, 'Altera internal PPR workshop',   FALSE, NULL),
    (133, 3, 43, 2, 2, 'Altera-Client joint - OPTIONAL', FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 3 under Altera internal PPR workshop (parent 132, IDs 134-136)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (134, 3, 132, 1, 3, 'Preparation',                         FALSE, NULL),
    (135, 3, 132, 2, 3, 'Workshop',                            FALSE, NULL),
    (136, 3, 132, 3, 3, 'Document findings & internal review', FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Depth 3 under Altera-Client joint - OPTIONAL (parent 133, IDs 137-143)
INSERT INTO WbsTemplateTasks
    (TemplateTaskId, TemplateId, ParentTemplateTaskId, SortOrder, Depth, TaskName, IsConcurrent, DefaultHoursJson) VALUES
    (137, 3, 133, 1, 3, 'Preparation',                          FALSE, NULL),
    (138, 3, 133, 2, 3, 'Workshop',                             FALSE, NULL),
    (139, 3, 133, 3, 3, 'Document findings & internal review',  FALSE, NULL),
    (140, 3, 133, 4, 3, 'Incorporate feedback & deliver Draft', FALSE, NULL),
    (141, 3, 133, 5, 3, 'Client Review & Feedback',             FALSE, NULL),
    (142, 3, 133, 6, 3, 'Incorporate feedback',                 FALSE, NULL),
    (143, 3, 133, 7, 3, 'Finalise & Deliver',                   FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Reset sequences so auto-generated IDs start after the seeded rows.
SELECT setval('resources_resourceid_seq',               (SELECT MAX(ResourceId)      FROM Resources));
SELECT setval('wbstemplates_templateid_seq',             (SELECT MAX(TemplateId)      FROM WbsTemplates));
SELECT setval('wbstemplatetasks_templatetaskid_seq',     (SELECT MAX(TemplateTaskId)  FROM WbsTemplateTasks));
