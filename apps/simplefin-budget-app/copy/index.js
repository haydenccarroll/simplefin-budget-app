// Every word the app shows, in one place. Edit the text here and it changes everywhere.
//
// Plain strings are used as they are. Where a sentence has a gap to fill (a name, an
// amount, a count), the entry is a small function that returns the sentence. Keep the
// arguments, move the words around however you like.
//
// Not in here: things that follow the phone's language (month and date names come from
// the system's formatter) and the app's name on the home screen (`name` in app.json).

const tickleLines = [
    'Hehehe!',
    'That tickles!',
    'Hee hee hee!',
    'Not the mustache!',
    'Pickle me silly!',
    'Haha! Again!',
    'Ticklin pickles!',
    'Please refrain from tickling me.',
];

const refreshLines = [
    'How refreshing!',
    'Ahh, so refreshing!',
    'Fresher than a cucumber on a vine!',
    'Fresh from the jar!',
];

const popups = {
    expenseAdded: [
        { title: 'What an eggcellent expense!', subtitle: 'Huzzah!' },
        { title: 'A dilly of an expense!', subtitle: 'Bill twirled his mustache in approval.' },
        { title: 'Pickle-tastic purchase!', subtitle: 'Dill approved.' },
        { title: 'Interesting expense 🤔', subtitle: 'Bill\'s watching you!' },
        { title: 'Expense added! Dill-ightful!', subtitle: 'Yahoo!' },
    ],
    expenseUpdated: [
          { title: 'That\'s more like it!', subtitle: 'Dill thinks that was a good move.' },
          { title: 'Sweet!', subtitle: 'Updated and looking pickly sweet' },
    ],
    expenseDeleted: [
        { title: 'Good choice!', subtitle: "In the trashcana it goes." },
        { title: 'That\'s more like it!', subtitle: 'Dill thinks that was a good move.' },
    ],
    incomeAdded: [
        { title: 'Eggcellent!', subtitle: 'Dill is real proud of that income.' },
        { title: 'Cha-ching!', subtitle: 'More dough means more pickles.' },
        { title: 'Yahoo!', subtitle: "Bill twirled his mustache in approval." },
        { title: 'Money in the pickle jar!', subtitle: 'Whoop, whoop!' },
    ],
    incomeUpdated: [
      { title: 'That\'s more like it!', subtitle: 'Dill thinks that was a good move.' },
      { title: 'Sweet!', subtitle: 'Updated and looking pickly sweet' },
    ],
    incomeDeleted: [
      { title: 'Good choice!', subtitle: "In the trashcana it goes." },
      { title: 'That\'s more like it!', subtitle: 'Dill thinks that was a good move.' },
    ],
    categoryAdded: [
        { title: 'A brand new pickle jar!', subtitle: 'Plenty of room for pickles!' },
        { title: 'Eggcellent category!', subtitle: 'Bill and Dill approve!' },
    ],
    categoryUpdated: [
        { title: 'Jar refreshed!', subtitle: 'Looking pickly perfect!' },
        { title: 'Sweet!', subtitle: 'Updated and looking pickly sweet' },
    ],
    categoryDeleted: [
      { title: 'Good choice!', subtitle: "In the trashcana it goes." },
      { title: 'That\'s more like it!', subtitle: 'Dill thinks that was a good move.' },
    ],
    budgetCreated: [
        { title: 'Your very own budget!', subtitle: "Bill and Dill can't wait to help you fill it!" },
        { title: 'A brand new budget!', subtitle: 'Yahoo!' },
    ],
    budgetJoined: [
        { title: 'Welcome to the jar!', subtitle: 'The gang saved you a seat.' },
        { title: 'You made it to the brine party!', subtitle: "Party don't start till you walk in." },
    ],
    memberRemoved: [
        { title: 'Toodles!', subtitle: 'Their entries stay in the jar, though.' },
    ],
    friendCodeChanged: [
        { title: 'Fresh new pickle code!', subtitle: 'The old one has expired, in the pickle sense' },
    ],
    friendCodeDeleted: [
        { title: 'Secret pickle!', subtitle: 'Nobody can join the pickle fun now.' },
    ],
    savedOffline: [
        { title: 'Saved in your pocket!', subtitle: "No connection, no problem. We'll send it when the jar's reachable." },
    ],
    entriesSynced: [
        { title: 'Back online!', subtitle: 'Everything you saved offline made it into the jar, pickly speaking.' },
    ],
    entriesRejected: [
        { title: 'Oh pickles!', subtitle: "Some offline entries couldn't be saved, so we had to toss them" },
    ],
    dataDeleted: [
        { title: 'Data wiped!', subtitle: 'Feel free to start a new budget or join a friend\'s!' },
    ],
};

const bigSpend = [
    { min: 1000, jokes: [
        { title: "Holy cannoli!", subtitle: 'That\'s a lot of dough.' },
        { title: 'Call the pickle police!', subtitle: "Someone's spending under the influence!" },
        { title: "Now that's an eggstravagant expense!", subtitle: "Uhh, we're gonna need a bigger jar." },
    ] },
    { min: 500, jokes: [
        { title: "That's a large sum of pickles!", subtitle: "Pickles don't grow on trees, you know." },
        { title: 'Big spender alert!', subtitle: 'Even Dill is nervous.' },
        { title: 'You know what?', subtitle: 'You deserve to spend like that :)' },
    ] },
    { min: 100, jokes: [
        { title: 'Ooh, a chunky eggspense!', subtitle: 'Dill raised an eyebrow.' },
        { title: "That's a big dill!", subtitle: 'Bill is intrigued.' },
        { title: "Are you nuts?", subtitle: "That's bananas!" },
    ] },
];

const copy = {
    app: {
        owners: "Bill & Dill's",
        name: 'Eggcellent Budgeting Tool!',
        // Small mascot in the corner of screen headers.
        headerMark: '🥒',
    },

    common: {
        save: '🤠 Save it!',
        add: '+ Add!',
        cancel: 'Cancel',
        confirm: 'Confirm',
        mysteryDate: 'Mystery date!',
        notInJar: 'Not in a jar yet!',
        bankSync: 'Bank sync',
        addedBy: (name) => `Added by ${name}`,
        networkError: 'Oh pickles, a network error! Please try again.',
        amountPlaceholder: '0.00',
        amountLabel: 'How much dough?',
        waitingToSync: 'Waiting to sync',
        autoJarred: 'Auto-jarred!',
    },

    api: {
        offline: "Uh oh, we can't reach the pickle right now. Check your connection.",
    },

    months: {
        previous: 'Previous month',
        next: 'Next month',
        pick: (label) => `${label}. Pick a month from the whole year`,
    },

    login: {
        usernameLabel: 'Username',
        usernamePlaceholder: 'pickleman44',
        passwordLabel: 'Password',
        passwordPlaceholder: "Password (shhh, it's a secret!)",
        submit: "Let's Go!",
        toRegister: 'New here? Join the pickle party!',
        unexpectedError: 'Uh-oh, something got pickled while logging in! Please try again.',
    },

    register: {
        title: 'Join us in the pickle jar!',
        firstName: 'First name',
        lastName: 'Last name',
        timezone: 'Brine zone',
        timezones: {
            'America/Los_Angeles': 'Pacific Time (America/Los_Angeles)',
            'America/Denver': 'Mountain Time (America/Denver)',
            'America/Chicago': 'Central Time (America/Chicago)',
            'America/New_York': 'Eastern Time (America/New_York)',
        },
        usernameLabel: 'Username',
        usernamePlaceholder: 'Please pickle a username',
        passwordLabel: 'Password (8+ characters)',
        passwordPlaceholder: 'picklypassword',
        passwordAgainLabel: 'Password again',
        passwordAgainPlaceholder: 'picklypassword',
        submit: 'Join us!',
        toLogin: 'Already in the pickle jar? Log in!',
        usernameInvalid: 'Pickle 3 to 30 letters, numbers, dots, dashes or underscores',
        passwordTooShort: 'Make it at least 8 characters long!',
        passwordMismatch: "Those passwords aren't a pickly pear! Try again.",
        unexpectedError: 'Oh no, something pickled while registering! Please try again.',
    },

    onboarding: {
        title: 'Pickle one to get started!',
        createTitle: 'Start a brand new budget',
        createBody: "You'll be the owner: you link the bank with your SimpleFIN token (optional), see who's in the budget, and can invite fellow pickles with a friend code.",
        createButton: 'Create my budget!',
        or: '~ or ~',
        joinTitle: "Join a pickler's budget",
        joinBody: 'Got a friend code from a fellow pickle? Drop it in!',
        joinPlaceholder: 'ABCD-EFGH',
        joinButton: 'Join the jar!',
        logout: 'Not you? Log out',
        createError: "Oh pickles! We couldn't start your budget.",
        joinError: "Oh pickles! We couldn't join that budget.",
    },

    home: {
        loading: 'Loading metaphorical pickles and their respective jars...',
        loadError: "Oh pickles! We couldn't load your budget.",
        startError: "Oh pickles! We couldn't start that budget.",

        // Under the app's name when something needs attention.
        worryOneJar: (name) => `Uh-oh! ${name} is over budget!`,
        worryManyJars: (count) => `Uh-oh! ${count} jars are over budget!`,
        worryUnassigned: (amount) => `Uh-oh! ${amount} still needs a job!`,
        worryOutOfBalance: 'Uh-oh! The budget is out of balance!',

        startTitle: (month) => `Time to start ${month}'s budget!`,
        startBody: (previousMonth) => `We'll copy ${previousMonth}'s categories and income so you don't have to start from scratch. Pickle-easy!`,
        startButton: "Let's Get Pickling!",

        balanceLabel: 'LEFT TO BUDGET',
        balanceCheer: 'Pickly Perfect!',
        balanceReplay: '(tap for hugs)',
        plannedIncome: 'Planned income',
        budgeted: 'Budgeted',
        // The line under the big number.
        balancedAllGood: 'The Budget is balanced! Every dollar has a job! Pickly Perfect!',
        balancedButOver: 'A jar is overflowing! Not quite pickly perfect yet.',
        balanceBlank: "A blank jar! Add some income and let's get cracking!",
        balanceLeftOver: (amount) => `Ooh, ${amount} still needs a job! Give it a pickle jar!`,
        balanceOverspent: (amount) => `Yikes! You've budgeted ${amount} more than you earned. What a pickle!`,

        incomeTitle: 'Eggcellent Income!',
        incomeAddLabel: 'Add income',
        incomeEmpty: { emoji: '🍳', title: 'No income planned yet!', subtitle: "Add some income for eggcellence!" },

        categoriesTitle: 'Pickle Jar Categories!',
        categoriesAddLabel: 'Add a category',
        categoriesEmpty: { emoji: '🫙', title: 'No pickle jars yet!', subtitle: 'Group your spending: Rent, Groceries, Eggs, whatever the dill you want!' },
        // "$50.00 of $200.00": the spent amount comes first, then this.
        categoryOf: (planned) => `of ${planned}`,

        recentTitle: 'Recent Eggspenses!',
        recentAddLabel: 'Add an eggspense',
        recentEmpty: { emoji: '🥒', title: 'No eggspenses yet!', subtitle: 'Tap + Add! when you spend some dough.' },
        seeAll: (count) => `See all ${count} eggspenses →`,
        seeEvery: 'See every eggspense! →',

        addExpenseLabel: 'Add an eggspense',
        profileLink: 'Profile',
        profileLabel: 'Open your profile',
    },

    expenses: {
        title: 'Eggspenses',
        empty: { emoji: '🥒', title: 'No eggspenses this month!', subtitle: 'Seems... suspicklious 🧐' },
        loadError: "Oh pickles! We couldn't fetch your eggspenses.",
        addLabel: 'Add an eggspense',
        delete: 'Delete',
        deleteLabel: (name) => `Delete ${name}`,
        deleteError: "Oh pickles! We couldn't delete that eggspense.",
        categoryTitle: 'Eggspenses in this jar',
        categoryEmpty: { emoji: '🥒', title: 'Nothing in this jar yet!', subtitle: 'Add an eggspense to get it going.' },
        categoryAdd: 'Add an eggspense to this jar',
        pickJar: 'Pick a jar',
    },

    expenseForm: {
        titleEdit: 'Adjust This Eggspense!',
        titleAdd: 'Add an Eggspense!',
        descriptionLabel: 'What did you buy?',
        descriptionPlaceholder: "e.g. Trader Joe's Kosher Dill Pickles (12ct)",
        jarLabel: 'Which pickle jar?',
        unassigned: 'Unassigned',
        autoJarHint: 'Our dill bot picked this jar! Save to confirm it, or pick a different one.',
        noteLabel: 'Secret pickle note (optional)',
        notePlaceholder: 'Anything else worth remembering?',
        delete: 'Delete eggspense',
        deleteTitle: 'Delete this eggspense?',
        deleteMessage: "It will be removed from the budget. This can't be undone.",
        needsDescription: 'Every eggspense needs a description, pickle pal!',
        loadJarsError: "Oh pickles! We couldn't load your jars.",
        saveError: "Oh pickles! We couldn't save that eggspense.",
        deleteError: "Oh pickles! We couldn't delete that eggspense.",
    },

    incomeForm: {
        titleEdit: 'Adjust This Dough!',
        titleAdd: 'Add Some Dough!',
        nameLabel: "Where's it from?",
        namePlaceholder: 'e.g. Drug Dilling',
        delete: 'Delete income',
        deleteTitle: 'Delete this income?',
        deleteMessage: "It will be removed from the budget. This can't be undone.",
        needsName: 'Your income needs a name, pickle pal!',
        saveError: "Oh dill! We couldn't save that income.",
        deleteError: "Oh pickles! We couldn't delete that income.",
    },

    categoryForm: {
        titleEdit: 'Adjust This Jar!',
        titleAdd: 'A New Pickle Jar!',
        nameLabel: "What's the jar labeled?",
        namePlaceholder: 'e.g. Rent, Cucumbers, Vinegar, Salt',
        amountLabel: 'How much dough for this jar?',
        descriptionLabel: 'Description (optional)',
        descriptionPlaceholder: 'e.g. restaurants, coffee shops, fast food, dillivery',
        descriptionHint: 'Tell us what belongs in this jar! New expenses get sorted automatically, and this helps our dill bot choose.',
        unassignedZero: 'All dough assigned. Perfectly balanced!',
        unassignedLeft: (amount) => `${amount} still unassigned`,
        unassignedOver: (amount) => `${amount} over what you earn`,
        useTheRest: (amount) => `Use the rest (${amount})`,
        shrinkToSpent: (amount) => `Shrink to spent (${amount})`,
        delete: 'Delete jar',
        deleteTitle: 'Delete this jar?',
        deleteMessage: "Eggspenses in it stay in the budget but won't be in a jar anymore. This can't be undone.",
        needsName: 'Every pickle jar needs a name!',
        saveError: "Oh pickles! We couldn't save that jar.",
        deleteError: "Oh pickles! We couldn't delete that jar.",
    },

    dateQuickPick: {
        label: 'When did it happen? (optional)',
        today: 'Today',
        yesterday: 'Yesterday',
        pickDate: 'Pick a Date!',
        clear: 'Clear date',
        none: 'No date: a mystery!',
    },

    pullToRefresh: {
        pull: 'Pull for a pickle-fresh budget!',
        release: 'Let go for a refreshing time!',
        refreshing: 'Refreshing... hold your pickles!',
    },

    pending: {
        offline: "You're offline, showing what was saved on this device.",
        waiting: (count) => `${count} ${count === 1 ? 'entry is' : 'entries are'} waiting to sync.`,
    },

    confirmModal: {
        prompt: (text) => `Type ${text} to be sure:`,
    },

    monthPicker: {
        title: 'Pick a Month!',
        previousYear: 'Previous year',
        nextYear: 'Next year',
        noBudgets: 'No budgets yet this year',
        budgetedCount: (count) => `${count} of 12 months budgeted`,
        thisMonth: 'This month',
        budgeted: '🥒 Budgeted',
        notBudgeted: '—',
        monthNames: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    },

    profile: {
        title: 'Your Pickly Profile!',
        firstName: 'First name',
        lastName: 'Last name',
        username: 'Username',
        timezone: 'Brine zone',
        currentPassword: 'Current password (needed to change your username)',
        simplefinLabel: 'SimpleFIN token (optional)',
        simplefinReplaceLabel: 'Replace your SimpleFIN token',
        simplefinPlaceholder: 'Paste a SimpleFIN setup token',
        simplefinOwnerHint: (connected) =>
            `You own this budget, so the bank link is yours: everyone in it syncs through your token. Create one at bridge.simplefin.org after linking your banks there. It works once, then SimpleFIN stays connected.${connected ? ' A bank is connected right now.' : ''}`,
        simplefinMemberHint: "The budget's owner links the bank, and you sync through their connection. Ask them to add a SimpleFIN token.",
        save: 'Save!',
        disconnect: 'Disconnect SimpleFIN',
        linkedAccounts: 'View Linked Brine Accounts!',
        changePassword: 'Change your password',
        logout: 'Log out (later, pickle pal!)',
        needsUsername: 'Hey pickle pal! We need a username',
        needsPasswordForUsername: 'To change your username, type your current password too.',
        loadError: "Oh pickles! We couldn't load your profile.",
        loadNetworkError: 'Oh pickles, a network error! Check your connection.',
        saved: 'Profile saved! Pickly perfect!',
        savedWithBank: 'Saved, and SimpleFIN connected! Eggcellent!',
        savedButBankFailed: (reason) => `Profile saved, but SimpleFIN didn't connect: ${reason}`,
        disconnected: 'SimpleFIN disconnected.',
        disconnectError: "Oh pickles! We couldn't disconnect SimpleFIN.",
    },

    budgetSection: {
        heading: 'Your Budget!',
        shareMessage: (code) => `Join my budget in Bill and Dill's Eggcellent Budget! Friend code: ${code}`,
        exportDialogTitle: 'Export your budget',

        friendCodeLabel: 'FRIEND CODE',
        friendCodeHint: 'Share this so a pickly friend can join your budget. They enter it when they sign up.',
        shareCode: 'Share the code!',
        freshCode: 'Get a fresh code',
        deleteCode: 'Delete the code',
        joiningOff: 'Joining is off',
        joiningOffOwner: 'Nobody can join this budget right now. Make a friend code when you want to let someone in; you can delete it again afterwards.',
        joiningOffMember: 'Nobody can join this budget right now. Ask its owner for a friend code if you want to invite someone.',
        makeCode: 'Make a friend code',

        membersLabel: (count) => `WHO'S IN THE JAR (${count})`,
        mysteryMember: 'Mystery pickle',
        you: ' (you)',
        ownerBadge: 'Owner',
        remove: 'Remove',
        leave: 'Leave this budget',

        dataLabel: 'YOUR DATA',
        dataHint: 'Get everything in the budget as a spreadsheet: every month with records, with its totals, income, categories and expenses.',
        export: 'Export everything (CSV)',
        deleteAll: 'Delete ALL data',
        deleteAllHint: 'This deletes the budget itself, so you (and everyone in it) can start or join a new one.',
        deleteAllNotOwner: "Only the budget's owner can delete the budget and all of its data.",

        confirmFreshCode: {
            title: 'Get a fresh friend code?',
            message: 'The old code will stop working. People already in the budget stay put.',
            confirmLabel: 'Get a fresh code',
        },
        confirmDeleteCode: {
            title: 'Delete the friend code?',
            message: 'Nobody will be able to join until you make a new code. People already in the budget stay put.',
            confirmLabel: 'Delete the code',
        },
        confirmRemove: {
            title: (name) => `Remove ${name || 'this person'}?`,
            message: "They'll go back to the create-or-join screen. Anything they entered stays in the budget. Consider getting a fresh code or deleting it, or they could rejoin with the old one.",
            confirmLabel: 'Remove',
        },
        confirmLeave: {
            title: 'Leave this budget?',
            message: "You'll go back to the create-or-join screen and won't see this budget anymore. Anything you entered stays in it. To come back, you'll need a friend code from its owner.",
            confirmLabel: 'Leave budget',
        },
        confirmDeleteAll: {
            title: 'Delete the budget and ALL its data?',
            message: "This permanently deletes the whole budget: every month, income, category and expense, the bank link, and the friend code. Everyone in it, you included, goes back to the create-or-join screen. It can't be undone. Accounts stay.",
            confirmLabel: 'Delete everything',
            requireText: 'PICKLY PERMANENT',
        },

        shareError: "Oh pickles! We couldn't share that code.",
        exportError: "Oh pickles! We couldn't export your budget.",
        freshCodeError: "Oh pickles! We couldn't change the friend code.",
        makeCodeError: "Oh pickles! We couldn't make a friend code.",
        deleteCodeError: "Oh pickles! We couldn't delete the friend code.",
        removeError: "Oh pickles! We couldn't remove that person.",
        leaveError: "Oh pickles! We couldn't leave the budget.",
        deleteAllError: "Oh pickles! We couldn't delete the budget.",
    },

    changePassword: {
        title: 'Change Your Password',
        current: 'Current password',
        new: 'New password (8+ characters)',
        newAgain: 'New password again',
        saved: 'Password changed! Your other devices were signed out.',
    },

    linkedAccounts: {
        title: 'Brine Accounts!',
        loadError: "Oh pickles! We couldn't load your brine accounts.",
        emptyTitle: 'No linked brine accounts yet!',
        emptyEmoji: '🏦',
        emptyOwner: 'Add your SimpleFIN token on your Profile to see your brine accounts!',
        emptyMember: "Ask the budget's owner to add their SimpleFIN token on their Profile!",
        toProfile: 'Back to Profile',
        sectionLabel: 'LINKED ACCOUNTS',
        neverSynced: 'Not synced yet',
        lastSynced: (date) => `Last synced ${date}`,
        noAccounts: "No accounts yet! They'll show up after the next sync.",
        signsFlipped: 'signs flipped',
        displayName: 'Display name',
        flipLabel: 'Flip income and expenses',
        flipHint: "Turn on if this account's purchases show up as income. Some credit cards report them backwards. Its imported transactions are re-imported when this changes.",
        cancel: 'Cancel',
        save: 'Save',
        manageNote: 'Tap an account to give it a silly nickname! Which accounts appear is managed in your SimpleFIN account.',
        updated: 'Account updated! Pickly perfect!',
        updatedAndSynced: 'Account updated and re-synced! Eggcellent!',
        updatedSyncFailed: 'Account updated! Sync from Home to re-import its transactions.',
        updateError: "Oh pickles! We couldn't update that account.",
    },

    // What Bill and Dill say. They're picked at random from each list.
    lines: {
        tickle: tickleLines,
        refresh: refreshLines,
        // Floats up from a napping pickle.
        sleeping: 'Zzz',
    },

    // The little popup after saving or deleting something, by what happened.
    popups,

    // A big new expense gets one of these instead of its usual popup. The first tier whose
    // `min` the amount reaches wins, so list them biggest first.
    bigSpend,
};

export default copy;
