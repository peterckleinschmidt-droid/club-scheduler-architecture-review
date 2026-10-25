type TeacherForForm = {
  teacher_name: string;
};

type ClubForForm = {
  club_title: string;
  section_label: string | null;
  description: string | null;
  grade_limited: boolean | null;
  eligible_grade: number | null;
  eligible_grades?: number[] | string[] | null;
};

type GenerateGoogleFormInput = {
  accessToken: string;
  schoolYearLabel: string;
  blockLabel: string;
  teachers: TeacherForForm[];
  clubs: ClubForForm[];
  targetFolderId?: string | null;
};

type CreatedGoogleForm = {
  formId: string;
  editUrl: string;
  responderUrl: string;
};

type GoogleFormItem = {
  itemId?: string;
  title?: string;
  description?: string;
  pageBreakItem?: unknown;
  questionItem?: {
    question?: {
      questionId?: string;
      required?: boolean;
      textQuestion?: {
        paragraph?: boolean;
      };
      choiceQuestion?: {
        type?: string;
        options?: Array<{
          value: string;
          goToAction?: string;
          goToSectionId?: string;
        }>;
        shuffle?: boolean;
      };
    };
  };
};

type GoogleForm = {
  formId: string;
  responderUri?: string;
  items?: GoogleFormItem[];
};

type FoundItem = {
  item: GoogleFormItem;
  index: number;
};

const GRADES = [3, 4, 5] as const;

type Grade = (typeof GRADES)[number];

function normalizeEligibleGrades(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as number[];
  }

  return value
    .map((item) => Number(item))
    .filter((item) => [3, 4, 5].includes(item));
}

function eligibleGradesForClub(club: ClubForForm) {
  if (!club.grade_limited) {
    return [...GRADES];
  }

  const eligibleGrades = normalizeEligibleGrades(club.eligible_grades);

  if (eligibleGrades.length > 0) {
    return eligibleGrades;
  }

  if (club.eligible_grade && [3, 4, 5].includes(club.eligible_grade)) {
    return [club.eligible_grade];
  }

  return [...GRADES];
}

function clubsForGrade(clubs: ClubForForm[], grade: Grade) {
  return clubs.filter((club) => eligibleGradesForClub(club).includes(grade));
}

function displayClubName(club: ClubForForm) {
  return club.section_label
    ? `${club.club_title} (${club.section_label})`
    : club.club_title;
}

async function googleJsonFetch({
  accessToken,
  url,
  method,
  body,
}: {
  accessToken: string;
  url: string;
  method: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      json?.error?.message ??
      json?.message ??
      `Google request failed with status ${response.status}.`;

    throw new Error(message);
  }

  return json;
}

async function moveDriveFileToFolder({
  accessToken,
  fileId,
  folderId,
}: {
  accessToken: string;
  fileId: string;
  folderId: string;
}) {
  const file = (await googleJsonFetch({
    accessToken,
    url: `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents,webViewLink`,
    method: 'GET',
  })) as {
    parents?: string[];
    webViewLink?: string;
  };

  const removeParents = (file.parents ?? []).join(',');

  const params = new URLSearchParams({
    addParents: folderId,
    fields: 'id,webViewLink',
  });

  if (removeParents) {
    params.set('removeParents', removeParents);
  }

  await googleJsonFetch({
    accessToken,
    url: `https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}`,
    method: 'PATCH',
    body: {},
  });
}

function multipleChoiceQuestion({
  title,
  options,
  required = true,
}: {
  title: string;
  options: string[];
  required?: boolean;
}) {
  return {
    title,
    questionItem: {
      question: {
        required,
        choiceQuestion: {
          type: 'RADIO',
          options: options.map((value) => ({ value })),
          shuffle: false,
        },
      },
    },
  };
}

function dropdownQuestion({
  title,
  options,
  required = true,
}: {
  title: string;
  options: string[];
  required?: boolean;
}) {
  return {
    title,
    questionItem: {
      question: {
        required,
        choiceQuestion: {
          type: 'DROP_DOWN',
          options: options.map((value) => ({ value })),
          shuffle: false,
        },
      },
    },
  };
}

function shortAnswerQuestion({
  title,
  required = true,
}: {
  title: string;
  required?: boolean;
}) {
  return {
    title,
    questionItem: {
      question: {
        required,
        textQuestion: {
          paragraph: false,
        },
      },
    },
  };
}

function pageBreak(title: string, description?: string) {
  return {
    title,
    description,
    pageBreakItem: {},
  };
}

function createItemRequest(item: unknown, index: number) {
  return {
    createItem: {
      item,
      location: {
        index,
      },
    },
  };
}

function buildInitialRequests({
  teachers,
  clubs,
}: {
  teachers: TeacherForForm[];
  clubs: ClubForForm[];
}) {
  const requests: unknown[] = [];
  let index = 0;

  requests.push(
    createItemRequest(
      shortAnswerQuestion({
        title: 'Student Name',
      }),
      index
    )
  );
  index += 1;

  requests.push(
    createItemRequest(
      multipleChoiceQuestion({
        title: 'Grade',
        options: ['3', '4', '5'],
      }),
      index
    )
  );
  index += 1;

  requests.push(
    createItemRequest(
      dropdownQuestion({
        title: 'Homeroom',
        options: teachers.map((teacher) => teacher.teacher_name),
      }),
      index
    )
  );
  index += 1;

  GRADES.forEach((grade) => {
    const gradeClubs = clubsForGrade(clubs, grade);
    const gradeClubNames = gradeClubs.map(displayClubName);

    requests.push(
      createItemRequest(
        pageBreak(
          `Grade ${grade} clubs`,
          'Answer each club question. Choose No thanks, Maybe, or Definitely.'
        ),
        index
      )
    );
    index += 1;

    gradeClubs.forEach((club) => {
      requests.push(
        createItemRequest(
          multipleChoiceQuestion({
            title: displayClubName(club),
            options: ['No thanks', 'Maybe', 'Definitely'],
          }),
          index
        )
      );
      index += 1;
    });

    requests.push(
      createItemRequest(
        multipleChoiceQuestion({
          title: `Max Clubs Grade ${grade}`,
          options: ['1', '2', '3'],
        }),
        index
      )
    );
    index += 1;

    requests.push(
      createItemRequest(
        dropdownQuestion({
          title: `Top Choice Grade ${grade}`,
          options: gradeClubNames.length > 0 ? gradeClubNames : ['No clubs available'],
        }),
        index
      )
    );
    index += 1;
  });

  return requests;
}

function findItemByTitle(form: GoogleForm, title: string): FoundItem | null {
  const items = form.items ?? [];
  const index = items.findIndex((item) => item.title === title);

  if (index < 0) {
    return null;
  }

  return {
    item: items[index],
    index,
  };
}

function requiredItemId(found: FoundItem | null, label: string) {
  if (!found?.item.itemId) {
    throw new Error(`Could not find Google Form item: ${label}`);
  }

  return found.item.itemId;
}

function updateGradeQuestionRequest({
  gradeQuestion,
  grade3SectionId,
  grade4SectionId,
  grade5SectionId,
}: {
  gradeQuestion: FoundItem;
  grade3SectionId: string;
  grade4SectionId: string;
  grade5SectionId: string;
}) {
  return {
    updateItem: {
      item: {
        itemId: gradeQuestion.item.itemId,
        title: 'Grade',
        questionItem: {
          question: {
            questionId: gradeQuestion.item.questionItem?.question?.questionId,
            required: true,
            choiceQuestion: {
              type: 'RADIO',
              options: [
                {
                  value: '3',
                  goToSectionId: grade3SectionId,
                },
                {
                  value: '4',
                  goToSectionId: grade4SectionId,
                },
                {
                  value: '5',
                  goToSectionId: grade5SectionId,
                },
              ],
              shuffle: false,
            },
          },
        },
      },
      location: {
        index: gradeQuestion.index,
      },
      updateMask: 'questionItem.question.choiceQuestion.options',
    },
  };
}

function updateTopChoiceSubmitRequest(found: FoundItem, title: string) {
  const existingOptions = found.item.questionItem?.question?.choiceQuestion?.options ?? [];

  return {
    updateItem: {
      item: {
        itemId: found.item.itemId,
        title,
        questionItem: {
          question: {
            questionId: found.item.questionItem?.question?.questionId,
            required: true,
            choiceQuestion: {
              type: 'DROP_DOWN',
              options: existingOptions.map((option) => ({
                value: option.value,
                goToAction: 'SUBMIT_FORM',
              })),
              shuffle: false,
            },
          },
        },
      },
      location: {
        index: found.index,
      },
      updateMask: 'questionItem.question.choiceQuestion.options',
    },
  };
}

async function publishForm(accessToken: string, formId: string) {
  try {
    await googleJsonFetch({
      accessToken,
      url: `https://forms.googleapis.com/v1/forms/${formId}:setPublishSettings`,
      method: 'POST',
      body: {
        publishSettings: {
          publishState: {
            isPublished: true,
            isAcceptingResponses: true,
          },
        },
        updateMask: 'publishState',
      },
    });
  } catch (error) {
    console.warn('Google Form publish step did not complete.', error);
  }
}

export async function generateGoogleForm({
  accessToken,
  schoolYearLabel,
  blockLabel,
  teachers,
  clubs,
  targetFolderId,
}: GenerateGoogleFormInput): Promise<CreatedGoogleForm> {
  if (teachers.length === 0) {
    throw new Error('Add at least one active teacher before creating the form.');
  }

  if (clubs.length === 0) {
    throw new Error('Add at least one active club before creating the form.');
  }

  const title = `${blockLabel} Student Club Choices`;

  const createdForm = await googleJsonFetch({
    accessToken,
    url: 'https://forms.googleapis.com/v1/forms',
    method: 'POST',
    body: {
      info: {
        title,
        documentTitle: `${schoolYearLabel} ${blockLabel} Student Club Choices`,
      },
    },
  });

  const formId = createdForm?.formId;

  if (!formId) {
    throw new Error('Google created the form, but did not return a form ID.');
  }

  if (targetFolderId) {
    await moveDriveFileToFolder({
      accessToken,
      fileId: formId,
      folderId: targetFolderId,
    });
  }

  await googleJsonFetch({
    accessToken,
    url: `https://forms.googleapis.com/v1/forms/${formId}:batchUpdate`,
    method: 'POST',
    body: {
      includeFormInResponse: false,
      requests: [
        {
          updateFormInfo: {
            info: {
              title,
              description:
                'Choose the clubs you would like for this session. Your teacher or school staff will use your choices to help make club assignments.',
            },
            updateMask: 'title,description',
          },
        },
        ...buildInitialRequests({ teachers, clubs }),
      ],
    },
  });

  const formAfterCreate = (await googleJsonFetch({
    accessToken,
    url: `https://forms.googleapis.com/v1/forms/${formId}`,
    method: 'GET',
  })) as GoogleForm;

  const gradeQuestion = findItemByTitle(formAfterCreate, 'Grade');
  const grade3SectionId = requiredItemId(
    findItemByTitle(formAfterCreate, 'Grade 3 clubs'),
    'Grade 3 clubs'
  );
  const grade4SectionId = requiredItemId(
    findItemByTitle(formAfterCreate, 'Grade 4 clubs'),
    'Grade 4 clubs'
  );
  const grade5SectionId = requiredItemId(
    findItemByTitle(formAfterCreate, 'Grade 5 clubs'),
    'Grade 5 clubs'
  );

  if (!gradeQuestion?.item.itemId) {
    throw new Error('Could not find the Grade question in the generated form.');
  }

  const navigationRequests: unknown[] = [
    updateGradeQuestionRequest({
      gradeQuestion,
      grade3SectionId,
      grade4SectionId,
      grade5SectionId,
    }),
  ];

  GRADES.forEach((grade) => {
    const topChoiceItem = findItemByTitle(formAfterCreate, `Top Choice Grade ${grade}`);

    if (topChoiceItem?.item.itemId) {
      navigationRequests.push(
        updateTopChoiceSubmitRequest(topChoiceItem, `Top Choice Grade ${grade}`)
      );
    }
  });

  await googleJsonFetch({
    accessToken,
    url: `https://forms.googleapis.com/v1/forms/${formId}:batchUpdate`,
    method: 'POST',
    body: {
      includeFormInResponse: false,
      requests: navigationRequests,
    },
  });

  await publishForm(accessToken, formId);

  const finalForm = (await googleJsonFetch({
    accessToken,
    url: `https://forms.googleapis.com/v1/forms/${formId}`,
    method: 'GET',
  })) as GoogleForm;

  return {
    formId,
    editUrl: `https://docs.google.com/forms/d/${formId}/edit`,
    responderUrl: finalForm.responderUri ?? `https://docs.google.com/forms/d/${formId}/viewform`,
  };
}