// [file name]: app.js
// [file content begin]
// Sistema de Controle Financeiro Pessoal - Versão Profissional 4.2
// Arquivo principal com IndexedDB e funcionalidades completas - CORRIGIDO

class FinanceApp {
    constructor() {
        this.db = null;
        this.currentSection = 'dashboard';
        this.transactionsPage = 1;
        this.transactionsPerPage = 10;
        this.charts = {};
        this.filters = {
            period: 'current-month',
            startDate: null,
            endDate: null,
            type: 'all',
            category: 'all',
            status: 'all'
        };
        
        // Cache para melhor performance
        this.cache = {
            transactions: null,
            investments: null,
            categories: null,
            lastUpdate: null
        };
        
        this.init();
    }

    async init() {
        try {
            await this.initDatabase();
            this.bindEvents();
            this.updateDate();
            await this.loadSettings();
            this.updateUI();
            await this.loadInitialData();
            
            // Inicializar datas dos filtros
            this.initDateFilters();
            
            // Ajustar altura dos gráficos para mobile
            this.adjustChartsForMobile();
            
            // Verificar e atualizar cache
            this.checkAndUpdateCache();
            
            console.log('✅ Sistema inicializado com sucesso');
            
        } catch (error) {
            console.error('❌ Erro na inicialização:', error);
            this.showAlert('Erro ao inicializar o sistema', 'danger');
        }
    }

    // Adicionar novo método para ajustar gráficos:
    adjustChartsForMobile() {
        const updateChartSizes = () => {
            if (window.innerWidth <= 768) {
                document.querySelectorAll('.chart-wrapper').forEach(wrapper => {
                    wrapper.style.minHeight = '200px';
                });
            } else {
                document.querySelectorAll('.chart-wrapper').forEach(wrapper => {
                    wrapper.style.minHeight = '250px';
                });
            }
        };
        
        updateChartSizes();
        window.addEventListener('resize', updateChartSizes);
    }

    // Método para verificar e atualizar cache
    checkAndUpdateCache() {
        setInterval(async () => {
            if (this.cache.lastUpdate && 
                (Date.now() - this.cache.lastUpdate) > 60000) { // 1 minuto
                await this.refreshCache();
            }
        }, 30000); // Verificar a cada 30 segundos
    }

    async refreshCache() {
        try {
            this.cache.transactions = await this.getAllTransactions();
            this.cache.investments = await this.getAllInvestments();
            this.cache.categories = await this.getSetting('categories') || [];
            this.cache.lastUpdate = Date.now();
            console.log('🔄 Cache atualizado');
        } catch (error) {
            console.error('Erro ao atualizar cache:', error);
        }
    }

    async getCachedTransactions() {
        if (!this.cache.transactions || !this.cache.lastUpdate) {
            this.cache.transactions = await this.getAllTransactions();
            this.cache.lastUpdate = Date.now();
        }
        return this.cache.transactions;
    }

    async getCachedInvestments() {
        if (!this.cache.investments || !this.cache.lastUpdate) {
            this.cache.investments = await this.getAllInvestments();
            this.cache.lastUpdate = Date.now();
        }
        return this.cache.investments;
    }

    async getCachedCategories() {
        if (!this.cache.categories || !this.cache.lastUpdate) {
            this.cache.categories = await this.getSetting('categories') || [];
            this.cache.lastUpdate = Date.now();
        }
        return this.cache.categories;
    }

    initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('FinanceDB_Pro_v4', 2); // Versão atualizada

            request.onerror = (event) => {
                console.error('Erro ao abrir o banco de dados:', event.target.error);
                this.showAlert('Erro ao conectar com o banco de dados', 'danger');
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('✅ Banco de dados conectado com sucesso');
                
                // Verificar se há migrações pendentes
                this.checkDatabaseMigration();
                
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion || 0;
                const newVersion = event.newVersion || 2;

                console.log(`🔄 Atualizando banco de dados: v${oldVersion} → v${newVersion}`);

                // Migração da versão 0 para 1 ou nova instalação
                if (oldVersion < 1) {
                    // Transações
                    if (!db.objectStoreNames.contains('transactions')) {
                        const transactionStore = db.createObjectStore('transactions', {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                        transactionStore.createIndex('date', 'date', { unique: false });
                        transactionStore.createIndex('type', 'type', { unique: false });
                        transactionStore.createIndex('category', 'category', { unique: false });
                        transactionStore.createIndex('status', 'status', { unique: false });
                        transactionStore.createIndex('createdAt', 'createdAt', { unique: false });
                    }

                    // Investimentos
                    if (!db.objectStoreNames.contains('investments')) {
                        const investmentStore = db.createObjectStore('investments', {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                        investmentStore.createIndex('type', 'type', { unique: false });
                        investmentStore.createIndex('date', 'date', { unique: false });
                    }

                    // Limites
                    if (!db.objectStoreNames.contains('limits')) {
                        db.createObjectStore('limits', {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                    }

                    // Configurações
                    if (!db.objectStoreNames.contains('settings')) {
                        const settingsStore = db.createObjectStore('settings', {
                            keyPath: 'key'
                        });
                    }
                }

                // Migração da versão 1 para 2
                if (oldVersion < 2) {
                    // Adicionar índices adicionais se necessário
                    const transactionStore = request.transaction.objectStore('transactions');
                    if (!transactionStore.indexNames.contains('monthYear')) {
                        transactionStore.createIndex('monthYear', ['date'], { unique: false });
                    }
                }
            };
        });
    }

    // Verificar migrações pendentes
    checkDatabaseMigration() {
        // Verificar e criar configurações padrão se não existirem
        this.ensureDefaultSettings();
    }

    async ensureDefaultSettings() {
        try {
            const defaultSettings = [
                { key: 'transactionTypes', value: ['Despesa', 'Receita', 'Transferência'] },
                { key: 'categories', value: [
                    { name: 'Alimentação', type: 'Despesa', icon: 'fas fa-utensils' },
                    { name: 'Transporte', type: 'Despesa', icon: 'fas fa-car' },
                    { name: 'Moradia', type: 'Despesa', icon: 'fas fa-home' },
                    { name: 'Lazer', type: 'Despesa', icon: 'fas fa-film' },
                    { name: 'Saúde', type: 'Despesa', icon: 'fas fa-heartbeat' },
                    { name: 'Educação', type: 'Despesa', icon: 'fas fa-graduation-cap' },
                    { name: 'Salário', type: 'Receita', icon: 'fas fa-money-check-alt' },
                    { name: 'Freelance', type: 'Receita', icon: 'fas fa-laptop-code' },
                    { name: 'Investimentos', type: 'Receita', icon: 'fas fa-chart-line' },
                    { name: 'Outros', type: 'Despesa', icon: 'fas fa-question-circle' }
                ]},
                { key: 'classifications', value: ['Essencial', 'Não Essencial', 'Urgente', 'Planejado', 'Opcional'] },
                { key: 'generalLimit', value: null },
                { key: 'theme', value: 'light' },
                { key: 'currencySymbol', value: 'R$' },
                { key: 'autoCategorize', value: true },
                { key: 'notifications', value: true },
                { key: 'decimalSeparator', value: ',' },
                { key: 'thousandsSeparator', value: '.' },
                { key: 'firstDayOfWeek', value: 0 } // 0 = Domingo, 1 = Segunda
            ];

            for (const setting of defaultSettings) {
                const existing = await this.getSetting(setting.key);
                if (existing === null || existing === undefined) {
                    await this.saveSetting(setting.key, setting.value);
                    console.log(`⚙️ Configuração padrão criada: ${setting.key}`);
                }
            }
        } catch (error) {
            console.error('Erro ao verificar configurações padrão:', error);
        }
    }

    bindEvents() {
        try {
            // Menu lateral
            document.querySelectorAll('.menu li').forEach(item => {
                item.addEventListener('click', (e) => {
                    const section = e.currentTarget.dataset.section;
                    this.switchSection(section);
                    this.closeSidebar();
                });
            });

            // Toggle do menu
            const menuToggle = document.getElementById('menu-toggle');
            if (menuToggle) {
                menuToggle.addEventListener('click', () => {
                    this.openSidebar();
                });
            }

            const closeSidebarBtn = document.getElementById('close-sidebar');
            if (closeSidebarBtn) {
                closeSidebarBtn.addEventListener('click', () => {
                    this.closeSidebar();
                });
            }

            // Overlay para fechar sidebar
            const overlay = document.getElementById('overlay');
            if (overlay) {
                overlay.addEventListener('click', () => {
                    this.closeSidebar();
                });
            }

            // Toggle do tema
            const themeToggle = document.getElementById('theme-toggle');
            if (themeToggle) {
                themeToggle.addEventListener('change', (e) => {
                    const theme = e.target.checked ? 'dark' : 'light';
                    this.setTheme(theme);
                    this.saveSetting('theme', theme);
                });
            }

            // Nova transação rápida
            const quickAddBtn = document.getElementById('quick-add');
            if (quickAddBtn) {
                quickAddBtn.addEventListener('click', () => {
                    this.switchSection('new-transaction');
                });
            }

            // Filtros do dashboard
            const dashboardPeriod = document.getElementById('dashboard-period');
            if (dashboardPeriod) {
                dashboardPeriod.addEventListener('change', (e) => {
                    const value = e.target.value;
                    const customRange = document.getElementById('custom-date-range');
                    
                    if (value === 'custom') {
                        customRange.style.display = 'flex';
                    } else {
                        customRange.style.display = 'none';
                        this.filters.period = value;
                        this.updateDashboard();
                    }
                });
            }

            const applyFiltersBtn = document.getElementById('apply-filters');
            if (applyFiltersBtn) {
                applyFiltersBtn.addEventListener('click', () => {
                    if (this.filters.period === 'custom') {
                        const startDate = document.getElementById('start-date').value;
                        const endDate = document.getElementById('end-date').value;
                        
                        if (!startDate || !endDate) {
                            this.showAlert('Selecione ambas as datas para o período personalizado', 'warning');
                            return;
                        }
                        
                        this.filters.startDate = startDate;
                        this.filters.endDate = endDate;
                    }
                    
                    this.updateDashboard();
                });
            }

            // Filtros de data
            const today = new Date().toISOString().split('T')[0];
            const startDateInput = document.getElementById('start-date');
            const endDateInput = document.getElementById('end-date');
            
            if (startDateInput) {
                startDateInput.max = today;
                startDateInput.addEventListener('change', (e) => {
                    if (endDateInput) {
                        endDateInput.min = e.target.value;
                    }
                });
            }
            
            if (endDateInput) {
                endDateInput.max = today;
                endDateInput.addEventListener('change', (e) => {
                    if (startDateInput) {
                        startDateInput.max = e.target.value;
                    }
                });
            }

            // Paginação de transações
            const prevPageBtn = document.getElementById('prev-page');
            const nextPageBtn = document.getElementById('next-page');
            
            if (prevPageBtn) {
                prevPageBtn.addEventListener('click', () => {
                    if (this.transactionsPage > 1) {
                        this.transactionsPage--;
                        this.loadTransactions();
                    }
                });
            }
            
            if (nextPageBtn) {
                nextPageBtn.addEventListener('click', () => {
                    this.transactionsPage++;
                    this.loadTransactions();
                });
            }

            // Busca de transações
            let searchTimeout;
            const searchInput = document.getElementById('search-transactions');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    clearTimeout(searchTimeout);
                    searchTimeout = setTimeout(() => {
                        this.loadTransactions(e.target.value);
                    }, 300);
                });
            }

            // Filtros de transações
            ['filter-type', 'filter-month', 'filter-category', 'filter-status'].forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.addEventListener('change', () => {
                        this.transactionsPage = 1;
                        this.loadTransactions();
                    });
                }
            });

            // Pagar todas do mês
            const payAllBtn = document.getElementById('pay-all-month');
            if (payAllBtn) {
                payAllBtn.addEventListener('click', () => {
                    this.payAllMonthlyTransactions();
                });
            }

            // Adicionar investimento
            const addInvestmentBtn = document.getElementById('add-investment');
            if (addInvestmentBtn) {
                addInvestmentBtn.addEventListener('click', () => {
                    this.openInvestmentModal();
                });
            }

            // Adicionar limite
            const addLimitBtn = document.getElementById('add-limit');
            if (addLimitBtn) {
                addLimitBtn.addEventListener('click', () => {
                    document.getElementById('add-limit-form').style.display = 'block';
                    this.loadCategoriesForLimits();
                });
            }

            // Cancelar limite
            const cancelLimitBtn = document.getElementById('cancel-limit');
            if (cancelLimitBtn) {
                cancelLimitBtn.addEventListener('click', () => {
                    document.getElementById('add-limit-form').style.display = 'none';
                    document.getElementById('limit-form').reset();
                });
            }

            // Formulário de limite
            const limitForm = document.getElementById('limit-form');
            if (limitForm) {
                limitForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.saveLimit();
                });
            }

            // Configurações - Adicionar tipo
            const addTypeBtn = document.getElementById('add-type');
            if (addTypeBtn) {
                addTypeBtn.addEventListener('click', () => {
                    this.addTransactionType();
                });
            }

            // Configurações - Adicionar categoria
            const addCategoryBtn = document.getElementById('add-category');
            if (addCategoryBtn) {
                addCategoryBtn.addEventListener('click', () => {
                    this.addCategory();
                });
            }

            // Salvar transação
            const transactionForm = document.getElementById('transaction-form');
            if (transactionForm) {
                transactionForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.saveTransaction();
                });
            }

            // Formulário de transação no modal (para edição)
            const saveTransactionBtn = document.getElementById('save-transaction-btn');
            if (saveTransactionBtn) {
                saveTransactionBtn.addEventListener('click', () => {
                    const form = document.getElementById('transaction-form');
                    if (form.checkValidity()) {
                        this.saveTransaction();
                    } else {
                        form.reportValidity();
                    }
                });
            }

            // Salvar investimento
            const investmentForm = document.getElementById('investment-form');
            if (investmentForm) {
                investmentForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await this.saveInvestment();
                });
            }

            // Exportar dados
            const exportBtn = document.getElementById('export-data');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => {
                    this.exportData();
                });
            }

            // Backup
            const exportBackupBtn = document.getElementById('export-backup');
            if (exportBackupBtn) {
                exportBackupBtn.addEventListener('click', () => {
                    this.exportBackup();
                });
            }

            // Gerar PDF
            const generatePdfBtn = document.getElementById('generate-pdf-report');
            if (generatePdfBtn) {
                generatePdfBtn.addEventListener('click', () => {
                    this.generatePDFReport();
                });
            }

            // Importar dados
            const browseFilesBtn = document.getElementById('browse-files');
            if (browseFilesBtn) {
                browseFilesBtn.addEventListener('click', () => {
                    document.getElementById('file-input').click();
                });
            }

            const fileInput = document.getElementById('file-input');
            if (fileInput) {
                fileInput.addEventListener('change', (e) => {
                    this.handleFileUpload(e.target.files);
                });
            }

            // Arrastar e soltar
            const dropZone = document.getElementById('drop-zone');
            if (dropZone) {
                dropZone.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    dropZone.classList.add('dragover');
                });

                dropZone.addEventListener('dragleave', () => {
                    dropZone.classList.remove('dragover');
                });

                dropZone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    dropZone.classList.remove('dragover');
                    const files = e.dataTransfer.files;
                    this.handleFileUpload(files);
                });
            }

            // Limpar todos os dados
            const clearDataBtn = document.getElementById('clear-all-data');
            if (clearDataBtn) {
                clearDataBtn.addEventListener('click', () => {
                    if (confirm('⚠️ TEM CERTEZA QUE DESEJA APAGAR TODOS OS DADOS?\n\nEsta ação NÃO pode ser desfeita e todos os seus registros serão perdidos permanentemente.')) {
                        this.clearAllData();
                    }
                });
            }

            // Configurar limite geral
            const editGeneralLimitBtn = document.querySelector('[data-action="edit-general-limit"]');
            if (editGeneralLimitBtn) {
                editGeneralLimitBtn.addEventListener('click', async () => {
                    const currentLimit = await this.getSetting('generalLimit');
                    const newLimit = parseFloat(prompt('Digite o limite geral mensal (R$):', currentLimit || '')) || 0;
                    if (newLimit > 0) {
                        await this.saveSetting('generalLimit', newLimit);
                        await this.loadLimits();
                        this.showAlert('Limite geral atualizado com sucesso!', 'success');
                    }
                });
            }

            // Fechar modais
            document.querySelectorAll('.close-modal, .cancel-modal').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.closeModal();
                });
            });

            // Fechar modal com ESC
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.closeModal();
                    this.closeSidebar();
                }
            });

            // Filtros de gráficos
            const chartPeriod = document.getElementById('chart-period');
            const chartType = document.getElementById('chart-type');
            
            if (chartPeriod) {
                chartPeriod.addEventListener('change', () => {
                    this.updateCharts();
                });
            }
            
            if (chartType) {
                chartType.addEventListener('change', () => {
                    this.createCategoryChart();
                });
            }

            // Redimensionamento da janela
            window.addEventListener('resize', () => {
                this.updateUI();
                this.adjustChartsForMobile();
                if (window.innerWidth > 1024) {
                    this.closeSidebar();
                }
            });

            // Download template
            const downloadTemplateBtn = document.getElementById('download-template');
            if (downloadTemplateBtn) {
                downloadTemplateBtn.addEventListener('click', () => {
                    this.downloadTemplate();
                });
            }

            // Adicionar evento para atualizar categorias baseado no tipo
            const transactionTypeSelect = document.getElementById('transaction-type');
            if (transactionTypeSelect) {
                transactionTypeSelect.addEventListener('change', () => {
                    this.updateCategoriesBasedOnType();
                });
            }

            // Atualizar limite geral quando mudar mês
            const limitMonthFilter = document.getElementById('limit-month-filter');
            if (limitMonthFilter) {
                limitMonthFilter.addEventListener('change', () => {
                    this.loadLimits();
                });
            }

            console.log('✅ Eventos vinculados com sucesso');

        } catch (error) {
            console.error('❌ Erro ao vincular eventos:', error);
        }
    }

    async updateCategoriesBasedOnType() {
        try {
            const type = document.getElementById('transaction-type').value;
            const categorySelect = document.getElementById('transaction-category');
            
            if (!type || !categorySelect) return;
            
            const categories = await this.getCachedCategories();
            const filteredCategories = categories.filter(cat => cat.type === type);
            
            categorySelect.innerHTML = '<option value="">Selecione...</option>';
            
            filteredCategories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.name;
                option.textContent = cat.name;
                categorySelect.appendChild(option);
            });
            
            // Se não houver categorias, adicionar opção padrão
            if (filteredCategories.length === 0) {
                const option = document.createElement('option');
                option.value = 'Outros';
                option.textContent = 'Outros';
                categorySelect.appendChild(option);
            }
            
        } catch (error) {
            console.error('Erro ao atualizar categorias:', error);
        }
    }

    initDateFilters() {
        try {
            const now = new Date();
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            
            const startDateInput = document.getElementById('start-date');
            const endDateInput = document.getElementById('end-date');
            const transactionDateInput = document.getElementById('transaction-date');
            const investmentDateInput = document.getElementById('investment-date');
            
            if (startDateInput) startDateInput.value = firstDay.toISOString().split('T')[0];
            if (endDateInput) endDateInput.value = lastDay.toISOString().split('T')[0];
            if (transactionDateInput) transactionDateInput.value = now.toISOString().split('T')[0];
            if (investmentDateInput) investmentDateInput.value = now.toISOString().split('T')[0];
            
        } catch (error) {
            console.error('Erro ao inicializar filtros de data:', error);
        }
    }

    async loadInitialData() {
        try {
            console.log('🔄 Carregando dados iniciais...');
            
            await this.loadTransactionTypes();
            await this.loadCategories();
            await this.loadClassifications();
            await this.loadDashboardData();
            await this.loadTransactions();
            await this.loadInvestments();
            await this.loadLimits();
            await this.loadSettingsUI();
            
            // Atualizar cache
            await this.refreshCache();
            
            console.log('✅ Dados iniciais carregados com sucesso');
            
        } catch (error) {
            console.error('❌ Erro ao carregar dados iniciais:', error);
            this.showAlert('Erro ao carregar dados do sistema', 'danger');
        }
    }

    updateUI() {
        try {
            // Atualizar título da página
            const pageTitle = document.getElementById('page-title');
            if (pageTitle) {
                const titles = {
                    'dashboard': 'Dashboard',
                    'transactions': 'Transações',
                    'investments': 'Investimentos',
                    'new-transaction': 'Nova Transação',
                    'import-export': 'Importar/Exportar',
                    'alerts': 'Alertas',
                    'settings': 'Configurações'
                };
                pageTitle.textContent = titles[this.currentSection] || 'Dashboard';
            }
            
            // Atualizar menu ativo
            document.querySelectorAll('.menu li').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.section === this.currentSection) {
                    item.classList.add('active');
                }
            });
            
            // Esconder/mostrar botão de texto em mobile
            const btnTexts = document.querySelectorAll('.btn-text');
            if (window.innerWidth <= 768) {
                btnTexts.forEach(text => text.style.display = 'none');
            } else {
                btnTexts.forEach(text => text.style.display = 'inline');
            }
            
        } catch (error) {
            console.error('Erro ao atualizar UI:', error);
        }
    }

    updateDate() {
        try {
            const now = new Date();
            const options = { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            };
            const currentDateElement = document.getElementById('current-date');
            if (currentDateElement) {
                currentDateElement.textContent = 
                    now.toLocaleDateString('pt-BR', options);
            }
        } catch (error) {
            console.error('Erro ao atualizar data:', error);
        }
    }

    openSidebar() {
        try {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('overlay');
            
            if (sidebar) sidebar.classList.add('active');
            if (overlay) overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        } catch (error) {
            console.error('Erro ao abrir sidebar:', error);
        }
    }

    closeSidebar() {
        try {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('overlay');
            
            if (sidebar) sidebar.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
            document.body.style.overflow = '';
        } catch (error) {
            console.error('Erro ao fechar sidebar:', error);
        }
    }

    switchSection(section) {
        try {
            this.currentSection = section;
            
            // Esconder todas as seções
            document.querySelectorAll('.section').forEach(sec => {
                sec.classList.remove('active');
            });
            
            // Mostrar seção atual
            const targetSection = document.getElementById(section);
            if (targetSection) {
                targetSection.classList.add('active');
            }
            
            // Atualizar UI
            this.updateUI();
            
            // Carregar dados específicos da seção
            switch(section) {
                case 'dashboard':
                    this.updateDashboard();
                    break;
                case 'transactions':
                    this.loadTransactions();
                    break;
                case 'investments':
                    this.loadInvestments();
                    break;
                case 'alerts':
                    this.loadLimits();
                    break;
                case 'new-transaction':
                    // Limpar formulário se for nova transação
                    if (!document.querySelector('#transaction-form [name="editing"]')) {
                        this.clearTransactionForm();
                    }
                    break;
            }
            
            // Scroll para o topo
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
        } catch (error) {
            console.error('Erro ao mudar seção:', error);
        }
    }

    clearTransactionForm() {
        try {
            const form = document.getElementById('transaction-form');
            if (form) {
                form.reset();
                const now = new Date().toISOString().split('T')[0];
                const dateInput = document.getElementById('transaction-date');
                if (dateInput) {
                    dateInput.value = now;
                }
                
                // Remover flag de edição
                const editingInput = document.querySelector('#transaction-form [name="editing"]');
                if (editingInput) {
                    editingInput.remove();
                }
            }
        } catch (error) {
            console.error('Erro ao limpar formulário:', error);
        }
    }

    async downloadTemplate() {
        const template = {
            transactions: [
                {
                    Data: new Date().toISOString().split('T')[0],
                    Tipo: 'Despesa',
                    Categoria: 'Alimentação',
                    Valor: '100.00',
                    Descrição: 'Exemplo de transação',
                    Situação: 'Pendente',
                    Classificação: 'Essencial',
                    Subcategoria: 'Supermercado',
                    Observações: 'Descrição opcional'
                },
                {
                    Data: new Date().toISOString().split('T')[0],
                    Tipo: 'Receita',
                    Categoria: 'Salário',
                    Valor: '3000.00',
                    Descrição: 'Exemplo de receita',
                    Situação: 'Paga',
                    Classificação: '',
                    Subcategoria: '',
                    Observações: ''
                }
            ],
            investments: [
                {
                    Nome: 'CDB Banco XP',
                    Tipo: 'CDB',
                    Data: new Date().toISOString().split('T')[0],
                    'Valor Investido': '1000.00',
                    'Valor Atual': '1020.50',
                    Descrição: 'Exemplo de investimento'
                }
            ]
        };
        
        this.exportToJSON(template, 'template_importacao_financeiro');
    }

    async loadDashboardData() {
        try {
            const transactions = await this.getCachedTransactions();
            const investments = await this.getCachedInvestments();
            
            // Aplicar filtros de período
            let filteredTransactions = this.filterByPeriod(transactions);
            
            // Calcular totais
            const totalIncome = filteredTransactions
                .filter(t => t.type === 'Receita')
                .reduce((sum, t) => sum + t.value, 0);
            
            const totalExpense = filteredTransactions
                .filter(t => t.type === 'Despesa')
                .reduce((sum, t) => sum + t.value, 0);
            
            const currentBalance = totalIncome - totalExpense;
            
            const totalInvestment = investments
                .reduce((sum, inv) => sum + inv.currentValue, 0);
            
            // Atualizar indicadores
            const currencySymbol = await this.getSetting('currencySymbol') || 'R$';
            
            const formatValue = (value) => {
                return `${currencySymbol} ${value.toFixed(2).replace('.', ',')}`;
            };
            
            const updateElement = (id, value) => {
                const element = document.getElementById(id);
                if (element) {
                    element.textContent = value;
                }
            };
            
            updateElement('total-income', formatValue(totalIncome));
            updateElement('total-expense', formatValue(totalExpense));
            updateElement('current-balance', formatValue(currentBalance));
            updateElement('total-investment', formatValue(totalInvestment));
            
            // Carregar transações recentes
            await this.loadRecentTransactions(filteredTransactions);
            
        } catch (error) {
            console.error('Erro ao carregar dados do dashboard:', error);
        }
    }

    filterByPeriod(transactions) {
        try {
            const now = new Date();
            let startDate, endDate;
            
            switch(this.filters.period) {
                case 'current-month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    break;
                case 'last-month':
                    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                    break;
                case 'current-year':
                    startDate = new Date(now.getFullYear(), 0, 1);
                    endDate = new Date(now.getFullYear(), 11, 31);
                    break;
                case 'custom':
                    if (this.filters.startDate && this.filters.endDate) {
                        startDate = new Date(this.filters.startDate);
                        endDate = new Date(this.filters.endDate);
                        // Garantir que a data final inclua o dia inteiro
                        endDate.setHours(23, 59, 59, 999);
                    } else {
                        startDate = new Date(2000, 0, 1);
                        endDate = new Date(2100, 0, 1);
                    }
                    break;
                default: // all
                    startDate = new Date(2000, 0, 1);
                    endDate = new Date(2100, 0, 1);
            }
            
            return transactions.filter(t => {
                try {
                    const date = new Date(t.date);
                    return date >= startDate && date <= endDate;
                } catch {
                    return false;
                }
            });
        } catch (error) {
            console.error('Erro ao filtrar por período:', error);
            return [];
        }
    }

    async loadRecentTransactions(transactions) {
        try {
            const recent = transactions
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 5);
            
            const container = document.getElementById('recent-transactions-list');
            if (!container) return;
            
            container.innerHTML = '';
            
            if (recent.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-receipt"></i>
                        <p>Nenhuma transação recente</p>
                    </div>
                `;
                return;
            }
            
            const currencySymbol = await this.getSetting('currencySymbol') || 'R$';
            
            recent.forEach(transaction => {
                const item = document.createElement('div');
                item.className = `transaction-item ${transaction.type === 'Receita' ? 'income' : 'expense'}`;
                
                const date = new Date(transaction.date).toLocaleDateString('pt-BR');
                const value = transaction.value.toFixed(2).replace('.', ',');
                
                item.innerHTML = `
                    <div class="transaction-info">
                        <div class="transaction-category">${transaction.category}</div>
                        <div class="transaction-description">${transaction.description}</div>
                        <small>${date}</small>
                    </div>
                    <div class="transaction-value ${transaction.type === 'Receita' ? 'positive' : 'negative'}">
                        ${transaction.type === 'Receita' ? '+' : '-'} ${currencySymbol} ${value}
                    </div>
                `;
                
                container.appendChild(item);
            });
        } catch (error) {
            console.error('Erro ao carregar transações recentes:', error);
        }
    }

    async loadTransactionTypes() {
        try {
            const types = await this.getSetting('transactionTypes') || [];
            const selects = [
                'transaction-type',
                'filter-type',
                'category-type'
            ];
            
            selects.forEach(selectId => {
                const select = document.getElementById(selectId);
                if (!select) return;
                
                const isFilter = selectId.includes('filter');
                const isCategoryType = selectId === 'category-type';
                
                select.innerHTML = isFilter 
                    ? '<option value="all">Todos os Tipos</option>'
                    : isCategoryType
                    ? '<option value="">Selecione o tipo</option>'
                    : '<option value="">Selecione...</option>';
                
                types.forEach(type => {
                    const option = document.createElement('option');
                    option.value = type;
                    option.textContent = type;
                    select.appendChild(option);
                });
            });
        } catch (error) {
            console.error('Erro ao carregar tipos de transação:', error);
        }
    }

    async loadCategories() {
        try {
            const categories = await this.getCachedCategories();
            const selects = [
                'transaction-category',
                'filter-category',
                'limit-category'
            ];
            
            selects.forEach(selectId => {
                const select = document.getElementById(selectId);
                if (!select) return;
                
                const isFilter = selectId.includes('filter');
                const isLimit = selectId === 'limit-category';
                
                select.innerHTML = isFilter 
                    ? '<option value="all">Todas Categorias</option>'
                    : isLimit
                    ? '<option value="">Selecione...</option>'
                    : '<option value="">Selecione...</option>';
                
                categories.forEach(cat => {
                    // Para filtros, mostrar todas as categorias
                    if (isFilter) {
                        const option = document.createElement('option');
                        option.value = cat.name;
                        option.textContent = `${cat.name} (${cat.type})`;
                        select.appendChild(option);
                    }
                    // Para limite, mostrar apenas categorias de despesa
                    else if (isLimit && cat.type === 'Despesa') {
                        const option = document.createElement('option');
                        option.value = cat.name;
                        option.textContent = cat.name;
                        select.appendChild(option);
                    }
                    // Para transação, mostrar todas
                    else if (!isFilter && !isLimit) {
                        const option = document.createElement('option');
                        option.value = cat.name;
                        option.textContent = cat.name;
                        select.appendChild(option);
                    }
                });
            });
            
            console.log('✅ Categorias carregadas:', categories.length);
        } catch (error) {
            console.error('Erro ao carregar categorias:', error);
        }
    }

    async loadClassifications() {
        try {
            const classifications = await this.getSetting('classifications') || [];
            const select = document.getElementById('transaction-classification');
            
            if (!select) return;
            
            select.innerHTML = '<option value="">Selecione...</option>';
            classifications.forEach(cls => {
                const option = document.createElement('option');
                option.value = cls;
                option.textContent = cls;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar classificações:', error);
        }
    }

    async loadCategoriesForLimits() {
        try {
            const categories = await this.getCachedCategories();
            const select = document.getElementById('limit-category');
            
            if (!select) return;
            
            select.innerHTML = '<option value="">Selecione...</option>';
            categories.forEach(cat => {
                if (cat.type === 'Despesa') {
                    const option = document.createElement('option');
                    option.value = cat.name;
                    option.textContent = cat.name;
                    select.appendChild(option);
                }
            });
            
            console.log('✅ Categorias para limites carregadas:', categories.filter(c => c.type === 'Despesa').length);
        } catch (error) {
            console.error('Erro ao carregar categorias para limites:', error);
        }
    }

    async loadTransactions(search = '') {
        try {
            console.log('🔄 Carregando transações...');
            
            // Usar cache para melhor performance
            const transactions = await this.getCachedTransactions();
            
            // Aplicar filtros
            let filtered = this.filterByPeriod(transactions);
            
            const typeFilter = document.getElementById('filter-type')?.value || 'all';
            const categoryFilter = document.getElementById('filter-category')?.value || 'all';
            const statusFilter = document.getElementById('filter-status')?.value || 'all';
            
            if (typeFilter !== 'all') {
                filtered = filtered.filter(t => t.type === typeFilter);
            }
            
            if (categoryFilter !== 'all') {
                filtered = filtered.filter(t => t.category === categoryFilter);
            }
            
            if (statusFilter !== 'all') {
                filtered = filtered.filter(t => {
                    if (statusFilter === 'overdue') {
                        return t.status === 'pending' && new Date(t.date) < new Date();
                    }
                    return t.status === statusFilter;
                });
            }
            
            // Busca
            if (search) {
                const searchLower = search.toLowerCase();
                filtered = filtered.filter(t => 
                    t.description.toLowerCase().includes(searchLower) ||
                    t.category.toLowerCase().includes(searchLower) ||
                    (t.notes && t.notes.toLowerCase().includes(searchLower))
                );
            }
            
            // Ordenar por data (mais recente primeiro)
            filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            // Paginação
            const total = filtered.length;
            const totalPages = Math.ceil(total / this.transactionsPerPage);
            const start = (this.transactionsPage - 1) * this.transactionsPerPage;
            const end = start + this.transactionsPerPage;
            const paginated = filtered.slice(start, end);
            
            // Atualizar tabela
            await this.updateTransactionsTable(paginated, total);
            
            // Atualizar resumo
            this.updateTransactionsSummary(filtered);
            
            // Atualizar paginação
            this.updatePagination(totalPages);
            
            // Atualizar filtro de mês
            this.updateMonthFilter(transactions);
            
            console.log(`✅ Transações carregadas: ${filtered.length} encontradas`);
            
        } catch (error) {
            console.error('❌ Erro ao carregar transações:', error);
            this.showAlert('Erro ao carregar transações', 'danger');
        }
    }

    async updateTransactionsTable(transactions, total) {
        try {
            const tbody = document.getElementById('transactions-body');
            if (!tbody) return;
            
            tbody.innerHTML = '';
            
            if (transactions.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="empty-state">
                            <i class="fas fa-receipt"></i>
                            <p>Nenhuma transação encontrada</p>
                        </td>
                    </tr>
                `;
                return;
            }
            
            const currencySymbol = await this.getSetting('currencySymbol') || 'R$';
            
            transactions.forEach(transaction => {
                const row = document.createElement('tr');
                row.dataset.id = transaction.id;
                
                // Formatar data
                const date = new Date(transaction.date);
                const formattedDate = date.toLocaleDateString('pt-BR');
                
                // Status
                let status = '';
                let statusClass = '';
                
                if (transaction.status === 'paid') {
                    status = 'Paga';
                    statusClass = 'success';
                } else {
                    const today = new Date();
                    if (date < today) {
                        status = 'Vencida';
                        statusClass = 'danger';
                    } else {
                        status = 'Pendente';
                        statusClass = 'warning';
                    }
                }
                
                // Valor formatado
                const value = transaction.value.toFixed(2).replace('.', ',');
                
                row.innerHTML = `
                    <td>${formattedDate}</td>
                    <td><span class="badge ${transaction.type === 'Receita' ? 'success' : 'danger'}">${transaction.type}</span></td>
                    <td>${transaction.category}</td>
                    <td><strong>${currencySymbol} ${value}</strong></td>
                    <td>${transaction.description}</td>
                    <td><span class="badge ${statusClass}">${status}</span></td>
                    <td>
                        <div class="table-actions">
                            <button class="action-btn edit" data-id="${transaction.id}" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="action-btn delete" data-id="${transaction.id}" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                            ${transaction.status !== 'paid' ? `
                                <button class="action-btn pay" data-id="${transaction.id}" title="Marcar como paga">
                                    <i class="fas fa-check"></i>
                                </button>
                            ` : ''}
                        </div>
                    </td>
                `;
                
                tbody.appendChild(row);
            });
            
            // Adicionar eventos
            this.bindTransactionTableEvents();
            
        } catch (error) {
            console.error('Erro ao atualizar tabela de transações:', error);
        }
    }

    bindTransactionTableEvents() {
        const tbody = document.getElementById('transactions-body');
        if (!tbody) return;
        
        // Editar transação
        tbody.querySelectorAll('.edit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                const transaction = await this.getTransaction(id);
                this.openTransactionModal(transaction);
            });
        });
        
        // Excluir transação
        tbody.querySelectorAll('.delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                if (confirm('Tem certeza que deseja excluir esta transação?')) {
                    await this.deleteTransaction(id);
                    // Atualizar cache
                    this.cache.transactions = null;
                    await this.refreshCache();
                    this.loadTransactions();
                    this.loadDashboardData();
                    this.updateCharts();
                }
            });
        });
        
        // Pagar transação
        tbody.querySelectorAll('.pay').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                await this.payTransaction(id);
                // Atualizar cache
                this.cache.transactions = null;
                await this.refreshCache();
                this.loadTransactions();
                this.loadDashboardData();
                this.updateCharts();
            });
        });
    }

    updateTransactionsSummary(transactions) {
        try {
            const total = transactions.length;
            const totalValue = transactions.reduce((sum, t) => sum + t.value, 0);
            const pending = transactions.filter(t => t.status !== 'paid').length;
            const overdue = transactions.filter(t => 
                t.status !== 'paid' && new Date(t.date) < new Date()
            ).length;
            
            const currencySymbol = document.querySelector('#currency-symbol')?.value || 'R$';
            
            const updateElement = (id, value) => {
                const element = document.getElementById(id);
                if (element) {
                    element.textContent = value;
                }
            };
            
            updateElement('total-transactions', total);
            updateElement('transactions-total-value', `${currencySymbol} ${totalValue.toFixed(2).replace('.', ',')}`);
            updateElement('pending-transactions', pending);
            updateElement('overdue-transactions', overdue);
            
        } catch (error) {
            console.error('Erro ao atualizar resumo de transações:', error);
        }
    }

    updatePagination(totalPages) {
        try {
            const pageInfo = document.getElementById('page-info');
            const prevBtn = document.getElementById('prev-page');
            const nextBtn = document.getElementById('next-page');
            
            if (pageInfo) {
                pageInfo.textContent = `Página ${this.transactionsPage} de ${totalPages}`;
            }
            
            if (prevBtn) {
                prevBtn.disabled = this.transactionsPage === 1;
            }
            
            if (nextBtn) {
                nextBtn.disabled = this.transactionsPage === totalPages || totalPages === 0;
            }
        } catch (error) {
            console.error('Erro ao atualizar paginação:', error);
        }
    }

    updateMonthFilter(transactions) {
        try {
            const months = new Set();
            const now = new Date();
            
            // Adicionar meses dos próximos 6 meses
            for (let i = -6; i <= 6; i++) {
                const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                months.add(`${year}-${month}`);
            }
            
            // Adicionar meses das transações
            transactions.forEach(t => {
                const date = new Date(t.date);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                months.add(`${year}-${month}`);
            });
            
            // Ordenar meses
            const sortedMonths = Array.from(months).sort((a, b) => b.localeCompare(a));
            
            // Atualizar select
            const select = document.getElementById('filter-month');
            if (!select) return;
            
            select.innerHTML = '<option value="all">Todos os Meses</option>';
            
            sortedMonths.forEach(month => {
                const [year, monthNum] = month.split('-');
                const monthName = new Date(year, monthNum - 1).toLocaleDateString('pt-BR', { month: 'long' });
                const option = document.createElement('option');
                option.value = month;
                option.textContent = `${monthName} ${year}`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao atualizar filtro de mês:', error);
        }
    }

    async loadInvestments() {
        try {
            const investments = await this.getCachedInvestments();
            const tbody = document.getElementById('investments-body');
            if (!tbody) return;
            
            tbody.innerHTML = '';
            
            if (investments.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="empty-state">
                            <i class="fas fa-chart-line"></i>
                            <p>Nenhum investimento encontrado</p>
                        </td>
                    </tr>
                `;
                
                // Atualizar resumo
                this.updateInvestmentSummary([]);
                return;
            }
            
            let totalInvested = 0;
            let totalCurrent = 0;
            const currencySymbol = await this.getSetting('currencySymbol') || 'R$';
            
            investments.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            investments.forEach(investment => {
                const row = document.createElement('tr');
                row.dataset.id = investment.id;
                
                // Formatar data
                const date = new Date(investment.date);
                const formattedDate = date.toLocaleDateString('pt-BR');
                
                // Calcular rentabilidade
                const profit = investment.currentValue - investment.amount;
                const profitability = investment.amount > 0 ? (profit / investment.amount) * 100 : 0;
                
                totalInvested += investment.amount;
                totalCurrent += investment.currentValue;
                
                row.innerHTML = `
                    <td>${investment.name}</td>
                    <td>${investment.type}</td>
                    <td>${formattedDate}</td>
                    <td><strong>${currencySymbol} ${investment.amount.toFixed(2).replace('.', ',')}</strong></td>
                    <td><strong>${currencySymbol} ${investment.currentValue.toFixed(2).replace('.', ',')}</strong></td>
                    <td>
                        <span class="badge ${profitability >= 0 ? 'success' : 'danger'}">
                            ${profitability >= 0 ? '+' : ''}${profitability.toFixed(2)}%
                        </span>
                    </td>
                    <td>
                        <div class="table-actions">
                            <button class="action-btn edit" data-id="${investment.id}" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="action-btn delete" data-id="${investment.id}" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });
            
            // Adicionar eventos
            this.bindInvestmentTableEvents();
            
            // Atualizar resumo
            this.updateInvestmentSummary(investments, totalInvested, totalCurrent);
            
        } catch (error) {
            console.error('Erro ao carregar investimentos:', error);
            this.showAlert('Erro ao carregar investimentos', 'danger');
        }
    }

    updateInvestmentSummary(investments, totalInvested = 0, totalCurrent = 0) {
        try {
            if (investments.length === 0) {
                const updateElement = (id, value) => {
                    const element = document.getElementById(id);
                    if (element) element.textContent = value;
                };
                
                updateElement('total-investments', '0');
                updateElement('total-invested', 'R$ 0,00');
                updateElement('current-value', 'R$ 0,00');
                updateElement('total-profitability', '0%');
                return;
            }
            
            const totalProfitability = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested * 100) : 0;
            const currencySymbol = document.querySelector('#currency-symbol')?.value || 'R$';
            
            const updateElement = (id, value) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            };
            
            updateElement('total-investments', investments.length);
            updateElement('total-invested', `${currencySymbol} ${totalInvested.toFixed(2).replace('.', ',')}`);
            updateElement('current-value', `${currencySymbol} ${totalCurrent.toFixed(2).replace('.', ',')}`);
            updateElement('total-profitability', `${totalProfitability >= 0 ? '+' : ''}${totalProfitability.toFixed(2)}%`);
            
        } catch (error) {
            console.error('Erro ao atualizar resumo de investimentos:', error);
        }
    }

    bindInvestmentTableEvents() {
        const tbody = document.getElementById('investments-body');
        if (!tbody) return;
        
        // Editar investimento
        tbody.querySelectorAll('.edit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                const investment = await this.getInvestment(id);
                this.openInvestmentModal(investment);
            });
        });
        
        // Excluir investimento
        tbody.querySelectorAll('.delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                if (confirm('Tem certeza que deseja excluir este investimento?')) {
                    await this.deleteInvestment(id);
                    // Atualizar cache
                    this.cache.investments = null;
                    await this.refreshCache();
                    this.loadInvestments();
                    this.loadDashboardData();
                }
            });
        });
    }

    async loadLimits() {
        try {
            const limits = await this.getAllLimits();
            const generalLimit = await this.getSetting('generalLimit');
            
            // Atualizar limite geral
            await this.updateGeneralLimit(generalLimit);
            
            // Atualizar limites por categoria
            await this.updateCategoryLimits(limits);
            
            // Verificar alertas
            await this.checkLimits();
            
        } catch (error) {
            console.error('Erro ao carregar limites:', error);
        }
    }

    async updateGeneralLimit(generalLimit) {
        try {
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            const transactions = await this.getCachedTransactions();
            const monthlyExpenses = transactions
                .filter(t => {
                    try {
                        const date = new Date(t.date);
                        return date.getMonth() === currentMonth && 
                               date.getFullYear() === currentYear &&
                               t.type === 'Despesa';
                    } catch {
                        return false;
                    }
                })
                .reduce((sum, t) => sum + t.value, 0);
            
            const currentElement = document.getElementById('general-limit-current');
            const maxElement = document.getElementById('general-limit-max');
            const progressElement = document.getElementById('general-limit-progress');
            
            if (!currentElement || !maxElement || !progressElement) return;
            
            if (generalLimit) {
                const percentage = Math.min((monthlyExpenses / generalLimit) * 100, 100);
                
                currentElement.textContent = `R$ ${monthlyExpenses.toFixed(2).replace('.', ',')}`;
                maxElement.textContent = `R$ ${generalLimit.toFixed(2).replace('.', ',')}`;
                
                progressElement.innerHTML = `
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${percentage}%"></div>
                    </div>
                    <span class="progress-text">${percentage.toFixed(1)}% utilizado</span>
                `;
            } else {
                currentElement.textContent = 'R$ 0,00';
                maxElement.textContent = 'Não configurado';
                progressElement.innerHTML = `
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: 0%"></div>
                    </div>
                    <span class="progress-text">Limite não configurado</span>
                `;
            }
        } catch (error) {
            console.error('Erro ao atualizar limite geral:', error);
        }
    }

    async updateCategoryLimits(limits) {
        try {
            const tbody = document.getElementById('limits-body');
            if (!tbody) return;
            
            tbody.innerHTML = '';
            
            // Carregar todas as categorias de despesa
            const categories = await this.getCachedCategories();
            const expenseCategories = categories.filter(cat => cat.type === 'Despesa');
            
            if (expenseCategories.length === 0 && limits.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="empty-state">
                            <i class="fas fa-chart-bar"></i>
                            <p>Nenhum limite configurado</p>
                            <p class="empty-hint">Adicione categorias de despesa em Configurações</p>
                        </td>
                    </tr>
                `;
                return;
            }
            
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            const transactions = await this.getCachedTransactions();
            const monthlyTransactions = transactions.filter(t => {
                try {
                    const date = new Date(t.date);
                    return date.getMonth() === currentMonth && 
                           date.getFullYear() === currentYear &&
                           t.type === 'Despesa';
                } catch {
                    return false;
                }
            });
            
            // Calcular gastos por categoria
            const categorySpending = {};
            monthlyTransactions.forEach(t => {
                if (!categorySpending[t.category]) {
                    categorySpending[t.category] = 0;
                }
                categorySpending[t.category] += t.value;
            });
            
            // Mapear limites por categoria para fácil acesso
            const limitsMap = {};
            limits.forEach(limit => {
                limitsMap[limit.category] = limit;
            });
            
            // Mostrar todas as categorias de despesa, com ou sem limite
            expenseCategories.forEach(category => {
                const categoryName = category.name;
                const limit = limitsMap[categoryName];
                const spent = categorySpending[categoryName] || 0;
                
                let row;
                
                if (limit) {
                    // Categoria com limite configurado
                    const percentage = limit.amount > 0 ? (spent / limit.amount) * 100 : 0;
                    
                    let status = 'Dentro do limite';
                    let statusClass = 'success';
                    
                    if (percentage >= 100) {
                        status = 'Limite atingido';
                        statusClass = 'danger';
                    } else if (percentage >= 80) {
                        status = 'Próximo do limite';
                        statusClass = 'warning';
                    }
                    
                    row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${categoryName}</td>
                        <td><strong>R$ ${limit.amount.toFixed(2).replace('.', ',')}</strong></td>
                        <td>R$ ${spent.toFixed(2).replace('.', ',')} (${percentage.toFixed(1)}%)</td>
                        <td><span class="badge ${statusClass}">${status}</span></td>
                        <td>
                            <div class="table-actions">
                                <button class="action-btn delete" data-id="${limit.id}" title="Excluir">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    `;
                    
                    // Adicionar eventos para exclusão
                    row.querySelector('.delete').addEventListener('click', async (e) => {
                        const id = parseInt(e.currentTarget.dataset.id);
                        if (confirm('Tem certeza que deseja excluir este limite?')) {
                            await this.deleteLimit(id);
                            this.loadLimits();
                        }
                    });
                } else {
                    // Categoria sem limite configurado
                    row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${categoryName}</td>
                        <td><strong>Não configurado</strong></td>
                        <td>R$ ${spent.toFixed(2).replace('.', ',')}</td>
                        <td><span class="badge info">Sem limite</span></td>
                        <td>
                            <div class="table-actions">
                                <button class="action-btn add-limit" data-category="${categoryName}" title="Adicionar limite">
                                    <i class="fas fa-plus"></i>
                                </button>
                            </div>
                        </td>
                    `;
                    
                    // Adicionar evento para adicionar limite
                    row.querySelector('.add-limit').addEventListener('click', (e) => {
                        const categoryName = e.currentTarget.dataset.category;
                        this.openAddLimitModal(categoryName);
                    });
                }
                
                tbody.appendChild(row);
            });
            
            console.log(`✅ Limites carregados: ${limits.length} configurados, ${expenseCategories.length} categorias totais`);
            
        } catch (error) {
            console.error('Erro ao atualizar limites por categoria:', error);
        }
    }

    openAddLimitModal(categoryName) {
        try {
            // Mostrar formulário de adição de limite
            document.getElementById('add-limit-form').style.display = 'block';
            
            // Preencher categoria automaticamente
            const categorySelect = document.getElementById('limit-category');
            if (categorySelect) {
                categorySelect.value = categoryName;
            }
            
            // Focar no campo de valor
            const amountInput = document.getElementById('limit-amount');
            if (amountInput) {
                amountInput.focus();
            }
            
            // Scroll para o formulário
            document.getElementById('add-limit-form').scrollIntoView({ behavior: 'smooth' });
            
        } catch (error) {
            console.error('Erro ao abrir modal de adição de limite:', error);
        }
    }

    async checkLimits() {
        try {
            const limits = await this.getAllLimits();
            const generalLimit = await this.getSetting('generalLimit');
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            const transactions = await this.getCachedTransactions();
            const monthlyExpenses = transactions
                .filter(t => {
                    try {
                        const date = new Date(t.date);
                        return date.getMonth() === currentMonth && 
                               date.getFullYear() === currentYear &&
                               t.type === 'Despesa';
                    } catch {
                        return false;
                    }
                })
                .reduce((sum, t) => sum + t.value, 0);
            
            // Calcular gastos por categoria
            const categorySpending = {};
            transactions
                .filter(t => {
                    try {
                        const date = new Date(t.date);
                        return date.getMonth() === currentMonth && 
                               date.getFullYear() === currentYear &&
                               t.type === 'Despesa';
                    } catch {
                        return false;
                    }
                })
                .forEach(t => {
                    if (!categorySpending[t.category]) {
                        categorySpending[t.category] = 0;
                    }
                    categorySpending[t.category] += t.value;
                });
            
            const alertsContainer = document.getElementById('global-alerts');
            if (!alertsContainer) return;
            
            alertsContainer.innerHTML = '';
            
            // Verificar limite geral
            if (generalLimit && monthlyExpenses > generalLimit) {
                const alert = document.createElement('div');
                alert.className = 'alert danger';
                alert.innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i>
                    <div>
                        <strong>Limite geral excedido!</strong>
                        <p>Você gastou R$ ${monthlyExpenses.toFixed(2).replace('.', ',')} de R$ ${generalLimit.toFixed(2).replace('.', ',')} este mês.</p>
                    </div>
                `;
                alertsContainer.appendChild(alert);
            }
            
            // Verificar limites por categoria
            limits.forEach(limit => {
                const spent = categorySpending[limit.category] || 0;
                if (spent > limit.amount) {
                    const alert = document.createElement('div');
                    alert.className = 'alert danger';
                    alert.innerHTML = `
                        <i class="fas fa-exclamation-triangle"></i>
                        <div>
                            <strong>Limite excedido: ${limit.category}</strong>
                            <p>Você gastou R$ ${spent.toFixed(2).replace('.', ',')} de R$ ${limit.amount.toFixed(2).replace('.', ',')}.</p>
                        </div>
                    `;
                    alertsContainer.appendChild(alert);
                } else if (spent > limit.amount * 0.8) {
                    const alert = document.createElement('div');
                    alert.className = 'alert warning';
                    alert.innerHTML = `
                        <i class="fas fa-exclamation-circle"></i>
                        <div>
                            <strong>Limite próximo: ${limit.category}</strong>
                            <p>Você já gastou R$ ${spent.toFixed(2).replace('.', ',')} de R$ ${limit.amount.toFixed(2).replace('.', ',')}.</p>
                        </div>
                    `;
                    alertsContainer.appendChild(alert);
                }
            });
        } catch (error) {
            console.error('Erro ao verificar limites:', error);
        }
    }

    openTransactionModal(transaction = null) {
        try {
            const modal = document.getElementById('transaction-modal');
            const modalTitle = document.getElementById('modal-title');
            
            if (transaction) {
                // Modo edição
                modalTitle.textContent = 'Editar Transação';
                
                // Adicionar campo oculto para identificar edição
                let editingInput = document.querySelector('#transaction-form [name="editing"]');
                if (!editingInput) {
                    editingInput = document.createElement('input');
                    editingInput.type = 'hidden';
                    editingInput.name = 'editing';
                    editingInput.value = transaction.id;
                    document.getElementById('transaction-form').appendChild(editingInput);
                } else {
                    editingInput.value = transaction.id;
                }
                
                // Carregar dados no formulário
                document.getElementById('transaction-date').value = transaction.date;
                document.getElementById('transaction-type').value = transaction.type;
                
                // Atualizar categorias baseado no tipo
                this.updateCategoriesBasedOnType().then(() => {
                    document.getElementById('transaction-category').value = transaction.category;
                });
                
                document.getElementById('transaction-classification').value = transaction.classification || '';
                document.getElementById('transaction-value').value = transaction.value.toString().replace('.', ',');
                document.getElementById('transaction-subcategory').value = transaction.subcategory || '';
                document.getElementById('transaction-description').value = transaction.description;
                document.getElementById('transaction-notes').value = transaction.notes || '';
                
                // Mudar para a seção de nova transação
                this.switchSection('new-transaction');
            } else {
                // Modo criação
                this.switchSection('new-transaction');
                
                // Limpar formulário
                this.clearTransactionForm();
            }
        } catch (error) {
            console.error('Erro ao abrir modal de transação:', error);
        }
    }

    openInvestmentModal(investment = null) {
        try {
            const modal = document.getElementById('investment-modal');
            const modalTitle = document.getElementById('investment-modal-title');
            
            if (!modal || !modalTitle) return;
            
            if (investment) {
                modalTitle.textContent = 'Editar Investimento';
                document.getElementById('investment-name').value = investment.name;
                document.getElementById('investment-type').value = investment.type;
                document.getElementById('investment-date').value = investment.date;
                document.getElementById('investment-amount').value = investment.amount;
                document.getElementById('investment-current-value').value = investment.currentValue;
                document.getElementById('investment-description').value = investment.description || '';
            } else {
                modalTitle.textContent = 'Novo Investimento';
                const form = document.getElementById('investment-form');
                form.reset();
                document.getElementById('investment-date').value = new Date().toISOString().split('T')[0];
            }
            
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        } catch (error) {
            console.error('Erro ao abrir modal de investimento:', error);
        }
    }

    closeModal() {
        try {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.classList.remove('active');
            });
            document.body.style.overflow = '';
        } catch (error) {
            console.error('Erro ao fechar modal:', error);
        }
    }

    async saveTransaction() {
        try {
            console.log('💾 Salvando transação...');
            
            const form = document.getElementById('transaction-form');
            if (!form || !form.checkValidity()) {
                if (form) form.reportValidity();
                return;
            }
            
            // Verificar se é edição
            const editingInput = document.querySelector('#transaction-form [name="editing"]');
            const isEditing = editingInput && editingInput.value;
            
            // Preparar transação
            const transaction = {
                date: document.getElementById('transaction-date').value,
                type: document.getElementById('transaction-type').value,
                category: document.getElementById('transaction-category').value,
                classification: document.getElementById('transaction-classification').value || null,
                value: parseFloat(document.getElementById('transaction-value').value.replace(',', '.')),
                subcategory: document.getElementById('transaction-subcategory').value || null,
                description: document.getElementById('transaction-description').value,
                notes: document.getElementById('transaction-notes').value || null,
                status: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            console.log('📝 Dados da transação:', transaction);
            
            // Validar campos obrigatórios
            if (!transaction.date || !transaction.type || !transaction.category || 
                isNaN(transaction.value) || transaction.value <= 0) {
                this.showAlert('Preencha todos os campos obrigatórios corretamente', 'warning');
                return;
            }
            
            let result;
            if (isEditing) {
                // Edição: obter transação existente e atualizar
                const existingTransaction = await this.getTransaction(parseInt(editingInput.value));
                if (existingTransaction) {
                    transaction.id = existingTransaction.id;
                    transaction.createdAt = existingTransaction.createdAt;
                    result = await this.updateTransaction(transaction);
                    console.log('✅ Transação atualizada:', result);
                }
            } else {
                // Nova transação
                result = await this.addTransaction(transaction);
                console.log('✅ Nova transação criada com ID:', result);
            }
            
            // Limpar cache
            this.cache.transactions = null;
            
            // Mostrar feedback
            this.showAlert(`Transação ${isEditing ? 'atualizada' : 'criada'} com sucesso!`, 'success');
            
            // Limpar formulário se não for edição
            if (!isEditing) {
                this.clearTransactionForm();
            } else {
                // Remover flag de edição
                editingInput.remove();
            }
            
            // Atualizar todas as views
            await this.refreshCache();
            await this.loadDashboardData();
            await this.loadTransactions();
            this.updateCharts();
            
            // Voltar para dashboard
            this.switchSection('dashboard');
            
        } catch (error) {
            console.error('❌ Erro ao salvar transação:', error);
            this.showAlert(`Erro ao salvar transação: ${error.message}`, 'danger');
        }
    }

    async saveInvestment() {
        try {
            const form = document.getElementById('investment-form');
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }
            
            const investment = {
                name: document.getElementById('investment-name').value,
                type: document.getElementById('investment-type').value,
                date: document.getElementById('investment-date').value,
                amount: parseFloat(document.getElementById('investment-amount').value),
                currentValue: parseFloat(document.getElementById('investment-current-value').value),
                description: document.getElementById('investment-description').value || null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            await this.addInvestment(investment);
            this.showAlert('Investimento criado com sucesso!', 'success');
            
            this.closeModal();
            
            // Limpar cache
            this.cache.investments = null;
            
            await this.refreshCache();
            await this.loadInvestments();
            await this.loadDashboardData();
            
        } catch (error) {
            console.error('Erro ao salvar investimento:', error);
            this.showAlert('Erro ao salvar investimento', 'danger');
        }
    }

    async saveLimit() {
        try {
            const form = document.getElementById('limit-form');
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }
            
            const limit = {
                category: document.getElementById('limit-category').value,
                amount: parseFloat(document.getElementById('limit-amount').value),
                createdAt: new Date().toISOString()
            };
            
            await this.addLimit(limit);
            this.showAlert('Limite salvo com sucesso!', 'success');
            
            form.reset();
            document.getElementById('add-limit-form').style.display = 'none';
            await this.loadLimits();
            
        } catch (error) {
            console.error('Erro ao salvar limite:', error);
            this.showAlert('Erro ao salvar limite', 'danger');
        }
    }

    async addTransactionType() {
        const input = document.getElementById('new-type');
        const type = input.value.trim();
        
        if (!type) {
            this.showAlert('Informe o nome do tipo', 'warning');
            return;
        }
        
        try {
            const types = await this.getSetting('transactionTypes') || [];
            if (types.includes(type)) {
                this.showAlert('Este tipo já existe', 'warning');
                return;
            }
            
            types.push(type);
            await this.saveSetting('transactionTypes', types);
            
            this.showAlert('Tipo adicionado com sucesso!', 'success');
            input.value = '';
            
            await this.loadTransactionTypes();
            this.loadSettingsUI();
            
        } catch (error) {
            console.error('Erro ao adicionar tipo:', error);
            this.showAlert('Erro ao adicionar tipo', 'danger');
        }
    }

    async addCategory() {
        const nameInput = document.getElementById('new-category');
        const typeSelect = document.getElementById('category-type');
        
        const name = nameInput.value.trim();
        const type = typeSelect.value;
        
        if (!name || !type) {
            this.showAlert('Preencha todos os campos', 'warning');
            return;
        }
        
        try {
            const categories = await this.getSetting('categories') || [];
            const exists = categories.some(cat => cat.name === name && cat.type === type);
            
            if (exists) {
                this.showAlert('Esta categoria já existe', 'warning');
                return;
            }
            
            categories.push({ name, type, icon: 'fas fa-tag' });
            await this.saveSetting('categories', categories);
            
            // Atualizar cache
            this.cache.categories = null;
            
            this.showAlert('Categoria adicionada com sucesso!', 'success');
            nameInput.value = '';
            typeSelect.value = '';
            
            await this.loadCategories();
            this.loadSettingsUI();
            
            // Recarregar limites para mostrar nova categoria
            await this.loadLimits();
            
        } catch (error) {
            console.error('Erro ao adicionar categoria:', error);
            this.showAlert('Erro ao adicionar categoria', 'danger');
        }
    }

    async loadSettingsUI() {
        try {
            // Carregar tipos
            const types = await this.getSetting('transactionTypes') || [];
            const typesList = document.getElementById('types-list');
            if (typesList) {
                typesList.innerHTML = '';
                
                types.forEach(type => {
                    const div = document.createElement('div');
                    div.className = 'settings-item';
                    div.innerHTML = `
                        <span>${type}</span>
                        <div class="item-actions">
                            <button class="action-btn delete" data-type="${type}" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `;
                    typesList.appendChild(div);
                });
                
                // Adicionar eventos de exclusão
                typesList.querySelectorAll('.delete').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const type = e.currentTarget.dataset.type;
                        if (confirm(`Tem certeza que deseja excluir o tipo "${type}"?`)) {
                            await this.removeTransactionType(type);
                        }
                    });
                });
            }
            
            // Carregar categorias
            const categories = await this.getSetting('categories') || [];
            const categoriesList = document.getElementById('categories-list');
            if (categoriesList) {
                categoriesList.innerHTML = '';
                
                categories.forEach(cat => {
                    const div = document.createElement('div');
                    div.className = 'settings-item';
                    div.innerHTML = `
                        <span>${cat.name} <small>(${cat.type})</small></span>
                        <div class="item-actions">
                            <button class="action-btn delete" data-category="${cat.name}" data-type="${cat.type}" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `;
                    categoriesList.appendChild(div);
                });
                
                // Adicionar eventos de exclusão
                categoriesList.querySelectorAll('.delete').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const category = e.currentTarget.dataset.category;
                        const type = e.currentTarget.dataset.type;
                        if (confirm(`Tem certeza que deseja excluir a categoria "${category}"?`)) {
                            await this.removeCategory(category, type);
                        }
                    });
                });
            }
            
            // Carregar configurações gerais
            const autoCategorize = await this.getSetting('autoCategorize');
            const notifications = await this.getSetting('notifications');
            const currencySymbol = await this.getSetting('currencySymbol');
            
            const autoCategorizeCheckbox = document.getElementById('auto-categorize');
            const notificationsCheckbox = document.getElementById('notifications');
            const currencySymbolInput = document.getElementById('currency-symbol');
            
            if (autoCategorizeCheckbox) autoCategorizeCheckbox.checked = autoCategorize;
            if (notificationsCheckbox) notificationsCheckbox.checked = notifications;
            if (currencySymbolInput) currencySymbolInput.value = currencySymbol;
            
        } catch (error) {
            console.error('Erro ao carregar configurações da UI:', error);
        }
    }

    async removeTransactionType(type) {
        try {
            const types = await this.getSetting('transactionTypes') || [];
            const filtered = types.filter(t => t !== type);
            await this.saveSetting('transactionTypes', filtered);
            
            this.showAlert('Tipo removido com sucesso!', 'success');
            await this.loadTransactionTypes();
            this.loadSettingsUI();
            
        } catch (error) {
            console.error('Erro ao remover tipo:', error);
            this.showAlert('Erro ao remover tipo', 'danger');
        }
    }

    async removeCategory(name, type) {
        try {
            const categories = await this.getSetting('categories') || [];
            const filtered = categories.filter(cat => !(cat.name === name && cat.type === type));
            await this.saveSetting('categories', filtered);
            
            // Atualizar cache
            this.cache.categories = null;
            
            this.showAlert('Categoria removida com sucesso!', 'success');
            await this.loadCategories();
            this.loadSettingsUI();
            
            // Recarregar limites para remover categoria
            await this.loadLimits();
            
        } catch (error) {
            console.error('Erro ao remover categoria:', error);
            this.showAlert('Erro ao remover categoria', 'danger');
        }
    }

    async updateDashboard() {
        await this.loadDashboardData();
        this.updateCharts();
        await this.loadLimits();
    }

    updateCharts() {
        // Destruir gráficos existentes
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        
        this.charts = {};
        
        // Carregar dados para os gráficos
        this.loadChartData();
    }

    async loadChartData() {
        try {
            const transactions = await this.getCachedTransactions();
            const filteredTransactions = this.filterByPeriod(transactions);
            
            // Dados para gráfico de receita vs despesa
            await this.createIncomeExpenseChart(filteredTransactions);
            
            // Dados para gráfico de categorias
            await this.createCategoryChart(filteredTransactions);
            
            // Dados para gráfico de tendência
            await this.createTrendChart(transactions);
            
        } catch (error) {
            console.error('Erro ao carregar dados dos gráficos:', error);
        }
    }

    async createIncomeExpenseChart(transactions) {
        try {
            const ctx = document.getElementById('income-expense-chart');
            if (!ctx) return;
            
            // Destruir gráfico existente
            if (this.charts.incomeExpense) {
                this.charts.incomeExpense.destroy();
            }
            
            const monthlyTransactions = transactions;
            
            const incomeExpenseData = {
                labels: ['Receita', 'Despesa'],
                datasets: [{
                    data: [
                        monthlyTransactions.filter(t => t.type === 'Receita').reduce((sum, t) => sum + t.value, 0),
                        monthlyTransactions.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + t.value, 0)
                    ],
                    backgroundColor: [
                        'rgba(76, 201, 240, 0.8)',
                        'rgba(247, 37, 133, 0.8)'
                    ],
                    borderColor: [
                        'rgb(76, 201, 240)',
                        'rgb(247, 37, 133)'
                    ],
                    borderWidth: 2
                }]
            };
            
            this.charts.incomeExpense = new Chart(ctx, {
                type: 'doughnut',
                data: incomeExpenseData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: getComputedStyle(document.documentElement).getPropertyValue('--text-color'),
                                font: {
                                    size: 12
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.raw || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                                    return `${label}: R$ ${value.toFixed(2)} (${percentage}%)`;
                                }
                            }
                        }
                    },
                    cutout: '60%'
                }
            });
        } catch (error) {
            console.error('Erro ao criar gráfico de receita vs despesa:', error);
        }
    }

    async createCategoryChart(transactions = null) {
        try {
            console.log('🔄 Criando gráfico de categorias...');
            
            const ctx = document.getElementById('category-chart');
            if (!ctx) {
                console.error('❌ Canvas do gráfico de categorias não encontrado');
                return;
            }
            
            // Destruir gráfico existente
            if (this.charts.category) {
                this.charts.category.destroy();
            }
            
            // Obter transações se não foram fornecidas
            if (!transactions) {
                transactions = await this.getCachedTransactions();
            }
            
            // Filtrar apenas despesas do período atual
            const filteredTransactions = this.filterByPeriod(transactions);
            const expenseTransactions = filteredTransactions.filter(t => t.type === 'Despesa');
            
            console.log(`📊 Total de despesas para gráfico: ${expenseTransactions.length}`);
            
            if (expenseTransactions.length === 0) {
                ctx.parentElement.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-chart-pie"></i>
                        <p>Não há dados de despesas para exibir</p>
                        <p class="empty-hint">Adicione algumas transações de despesa para ver o gráfico</p>
                    </div>
                `;
                return;
            }
            
            // Agrupar despesas por categoria
            const categoryTotals = {};
            expenseTransactions.forEach(t => {
                if (!categoryTotals[t.category]) {
                    categoryTotals[t.category] = 0;
                }
                categoryTotals[t.category] += t.value;
            });
            
            // Converter para arrays e ordenar
            const categories = Object.keys(categoryTotals);
            const values = categories.map(cat => categoryTotals[cat]);
            
            // Ordenar por valor (maior para menor) e pegar top 8
            const sortedData = categories.map((cat, index) => ({
                category: cat,
                value: values[index]
            })).sort((a, b) => b.value - a.value).slice(0, 8);
            
            const sortedCategories = sortedData.map(d => d.category);
            const sortedValues = sortedData.map(d => d.value);
            
            console.log('📈 Dados do gráfico:', sortedCategories, sortedValues);
            
            // Gerar cores
            const generateColors = (count) => {
                const colors = [];
                const hueStep = 360 / count;
                for (let i = 0; i < count; i++) {
                    const hue = (i * hueStep) % 360;
                    colors.push(`hsl(${hue}, 70%, 60%)`);
                }
                return colors;
            };
            
            const categoryColors = generateColors(sortedCategories.length);
            
            const categoryChartData = {
                labels: sortedCategories,
                datasets: [{
                    data: sortedValues,
                    backgroundColor: categoryColors,
                    borderWidth: 2,
                    borderColor: 'rgba(255, 255, 255, 0.8)'
                }]
            };
            
            const chartType = document.getElementById('chart-type')?.value || 'pie';
            
            this.charts.category = new Chart(ctx, {
                type: chartType,
                data: categoryChartData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: getComputedStyle(document.documentElement).getPropertyValue('--text-color'),
                                font: {
                                    size: 11
                                },
                                padding: 20,
                                boxWidth: 12
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.raw || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                                    return `${label}: R$ ${value.toFixed(2)} (${percentage}%)`;
                                }
                            }
                        }
                    },
                    animation: {
                        animateScale: true,
                        animateRotate: true
                    }
                }
            });
            
            console.log('✅ Gráfico de categorias criado com sucesso');
            
        } catch (error) {
            console.error('❌ Erro ao criar gráfico de categorias:', error);
            const ctx = document.getElementById('category-chart');
            if (ctx && ctx.parentElement) {
                ctx.parentElement.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Erro ao carregar gráfico</p>
                        <p class="empty-hint">${error.message}</p>
                    </div>
                `;
            }
        }
    }

    async createTrendChart(transactions) {
        try {
            const ctx = document.getElementById('trend-chart');
            if (!ctx) return;
            
            // Destruir gráfico existente
            if (this.charts.trend) {
                this.charts.trend.destroy();
            }
            
            const now = new Date();
            const trendLabels = [];
            const trendIncome = [];
            const trendExpense = [];
            
            // Últimos 6 meses
            for (let i = 5; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const monthName = date.toLocaleDateString('pt-BR', { month: 'short' });
                trendLabels.push(`${monthName}/${date.getFullYear().toString().slice(2)}`);
                
                const monthTransactions = transactions.filter(t => {
                    try {
                        const transDate = new Date(t.date);
                        return transDate.getMonth() === date.getMonth() && 
                               transDate.getFullYear() === date.getFullYear();
                    } catch {
                        return false;
                    }
                });
                
                trendIncome.push(
                    monthTransactions
                        .filter(t => t.type === 'Receita')
                        .reduce((sum, t) => sum + t.value, 0)
                );
                
                trendExpense.push(
                    monthTransactions
                        .filter(t => t.type === 'Despesa')
                        .reduce((sum, t) => sum + t.value, 0)
                );
            }
            
            const trendChartData = {
                labels: trendLabels,
                datasets: [
                    {
                        label: 'Receita',
                        data: trendIncome,
                        borderColor: 'rgb(76, 201, 240)',
                        backgroundColor: 'rgba(76, 201, 240, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 3
                    },
                    {
                        label: 'Despesa',
                        data: trendExpense,
                        borderColor: 'rgb(247, 37, 133)',
                        backgroundColor: 'rgba(247, 37, 133, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 3
                    }
                ]
            };
            
            this.charts.trend = new Chart(ctx, {
                type: 'line',
                data: trendChartData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                color: getComputedStyle(document.documentElement).getPropertyValue('--text-color'),
                                font: {
                                    size: 12
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary'),
                                callback: function(value) {
                                    return 'R$ ' + value.toFixed(0);
                                }
                            },
                            grid: {
                                color: getComputedStyle(document.documentElement).getPropertyValue('--border-color')
                            }
                        },
                        x: {
                            ticks: {
                                color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary')
                            },
                            grid: {
                                color: getComputedStyle(document.documentElement).getPropertyValue('--border-color')
                            }
                        }
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    }
                }
            });
        } catch (error) {
            console.error('Erro ao criar gráfico de tendência:', error);
        }
    }

    async payTransaction(id) {
        try {
            const transaction = await this.getTransaction(id);
            if (!transaction) {
                this.showAlert('Transação não encontrada', 'warning');
                return;
            }
            
            transaction.status = 'paid';
            transaction.updatedAt = new Date().toISOString();
            await this.updateTransaction(transaction);
            this.showAlert('Transação marcada como paga!', 'success');
        } catch (error) {
            console.error('Erro ao pagar transação:', error);
            this.showAlert('Erro ao pagar transação', 'danger');
        }
    }

    async payAllMonthlyTransactions() {
        try {
            const transactions = await this.getCachedTransactions();
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            const monthlyTransactions = transactions.filter(t => {
                try {
                    const date = new Date(t.date);
                    return date.getMonth() === currentMonth && 
                           date.getFullYear() === currentYear &&
                           t.status !== 'paid' &&
                           t.type === 'Despesa';
                } catch {
                    return false;
                }
            });
            
            if (monthlyTransactions.length === 0) {
                this.showAlert('Não há transações pendentes para pagar este mês', 'info');
                return;
            }
            
            if (confirm(`Deseja marcar todas as ${monthlyTransactions.length} transações pendentes como pagas?`)) {
                for (const transaction of monthlyTransactions) {
                    transaction.status = 'paid';
                    transaction.updatedAt = new Date().toISOString();
                    await this.updateTransaction(transaction);
                }
                
                // Limpar cache
                this.cache.transactions = null;
                
                this.showAlert(`${monthlyTransactions.length} transações marcadas como pagas!`, 'success');
                await this.refreshCache();
                this.loadTransactions();
                this.loadDashboardData();
                this.updateCharts();
            }
        } catch (error) {
            console.error('Erro ao pagar transações:', error);
            this.showAlert('Erro ao pagar transações', 'danger');
        }
    }

    async exportData() {
        try {
            const format = document.getElementById('export-format')?.value || 'xlsx';
            const period = document.getElementById('export-period')?.value || 'current-month';
            const dataType = document.getElementById('export-data-type')?.value || 'transactions';
            
            let startDate, endDate;
            const now = new Date();
            
            switch (period) {
                case 'current-month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    break;
                case 'last-month':
                    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                    break;
                case 'current-year':
                    startDate = new Date(now.getFullYear(), 0, 1);
                    endDate = new Date(now.getFullYear(), 11, 31);
                    break;
                default: // all
                    startDate = new Date(2000, 0, 1);
                    endDate = new Date(2100, 0, 1);
            }
            
            let data = [];
            let filename = '';
            
            if (dataType === 'transactions' || dataType === 'all') {
                const transactions = await this.getCachedTransactions();
                const filtered = transactions.filter(t => {
                    try {
                        const date = new Date(t.date);
                        return date >= startDate && date <= endDate;
                    } catch {
                        return false;
                    }
                });
                
                if (dataType === 'transactions') {
                    data = filtered.map(t => ({
                        Data: new Date(t.date).toLocaleDateString('pt-BR'),
                        Tipo: t.type,
                        Categoria: t.category,
                        Valor: t.value.toFixed(2),
                        Descrição: t.description,
                        Situação: t.status === 'paid' ? 'Paga' : 'Pendente',
                        Classificação: t.classification || '',
                        Subcategoria: t.subcategory || '',
                        Observações: t.notes || ''
                    }));
                    filename = 'transacoes';
                } else {
                    data.transactions = filtered;
                }
            }
            
            if (dataType === 'investments' || dataType === 'all') {
                const investments = await this.getCachedInvestments();
                const filtered = investments.filter(inv => {
                    try {
                        const date = new Date(inv.date);
                        return date >= startDate && date <= endDate;
                    } catch {
                        return false;
                    }
                });
                
                if (dataType === 'investments') {
                    data = filtered.map(inv => ({
                        Nome: inv.name,
                        Tipo: inv.type,
                        Data: new Date(inv.date).toLocaleDateString('pt-BR'),
                        'Valor Investido': inv.amount.toFixed(2),
                        'Valor Atual': inv.currentValue.toFixed(2),
                        Rentabilidade: inv.amount > 0 ? ((inv.currentValue - inv.amount) / inv.amount * 100).toFixed(2) + '%' : '0%',
                        Descrição: inv.description || ''
                    }));
                    filename = 'investimentos';
                } else if (dataType === 'all') {
                    data.investments = filtered;
                }
            }
            
            if (data.length === 0 && (!data.transactions || data.transactions.length === 0) && (!data.investments || data.investments.length === 0)) {
                this.showAlert('Nenhum dado encontrado para exportar', 'warning');
                return;
            }
            
            switch (format) {
                case 'xlsx':
                    this.exportToExcel(data, filename || 'dados_financeiros');
                    break;
                case 'csv':
                    this.exportToCSV(data, filename || 'dados_financeiros');
                    break;
                case 'json':
                    this.exportToJSON(dataType === 'all' ? data : { data }, filename || 'dados_financeiros');
                    break;
                case 'pdf':
                    this.exportToPDF(data, filename || 'relatorio');
                    break;
            }
            
        } catch (error) {
            console.error('Erro ao exportar dados:', error);
            this.showAlert('Erro ao exportar dados', 'danger');
        }
    }

    exportToExcel(data, filename) {
        try {
            if (typeof XLSX === 'undefined') {
                this.showAlert('Biblioteca XLSX não encontrada', 'danger');
                return;
            }
            
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Dados');
            XLSX.writeFile(wb, `${filename}.xlsx`);
            this.showAlert('Arquivo Excel exportado com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao exportar Excel:', error);
            this.showAlert('Erro ao exportar Excel', 'danger');
        }
    }

    exportToCSV(data, filename) {
        try {
            const headers = Object.keys(data[0]);
            const csv = [
                headers.join(';'),
                ...data.map(row => headers.map(header => {
                    const cell = row[header];
                    return typeof cell === 'string' ? `"${cell.replace(/"/g, '""')}"` : cell;
                }).join(';'))
            ].join('\n');
            
            const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', `${filename}.csv`);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.showAlert('Arquivo CSV exportado com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao exportar CSV:', error);
            this.showAlert('Erro ao exportar CSV', 'danger');
        }
    }

    exportToJSON(data, filename) {
        try {
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', `${filename}.json`);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.showAlert('Arquivo JSON exportado com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao exportar JSON:', error);
            this.showAlert('Erro ao exportar JSON', 'danger');
        }
    }

    exportToPDF(data, filename) {
        try {
            if (typeof window.jspdf === 'undefined') {
                this.showAlert('Biblioteca jsPDF não encontrada', 'danger');
                return;
            }
            
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // Título
            doc.setFontSize(20);
            doc.text('Relatório de Transações', 14, 22);
            
            // Data
            doc.setFontSize(11);
            doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 32);
            
            // Tabela
            const headers = [['Data', 'Tipo', 'Categoria', 'Valor', 'Descrição', 'Situação']];
            const rows = data.map(item => [
                item.Data,
                item.Tipo,
                item.Categoria,
                `R$ ${item.Valor}`,
                item.Descrição.substring(0, 20) + (item.Descrição.length > 20 ? '...' : ''),
                item.Situação
            ]);
            
            doc.autoTable({
                head: headers,
                body: rows,
                startY: 40,
                styles: { fontSize: 9 },
                headStyles: { fillColor: [66, 83, 226] }
            });
            
            // Salvar
            doc.save(`${filename}.pdf`);
            this.showAlert('Relatório PDF gerado com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao gerar PDF:', error);
            this.showAlert('Erro ao gerar PDF', 'danger');
        }
    }

    async exportBackup() {
        try {
            const transactions = await this.getAllTransactions();
            const investments = await this.getAllInvestments();
            const limits = await this.getAllLimits();
            
            const settings = {};
            const settingsKeys = [
                'transactionTypes',
                'categories',
                'classifications',
                'generalLimit',
                'theme',
                'currencySymbol',
                'autoCategorize',
                'notifications'
            ];
            
            for (const key of settingsKeys) {
                settings[key] = await this.getSetting(key);
            }
            
            const backup = {
                transactions,
                investments,
                limits,
                settings,
                exportDate: new Date().toISOString(),
                version: '4.2'
            };
            
            this.exportToJSON(backup, 'backup_financeiro');
            
        } catch (error) {
            console.error('Erro ao exportar backup:', error);
            this.showAlert('Erro ao exportar backup', 'danger');
        }
    }

    async generatePDFReport() {
        try {
            if (typeof window.jspdf === 'undefined') {
                this.showAlert('Biblioteca jsPDF não encontrada', 'danger');
                return;
            }
            
            const period = document.getElementById('pdf-period')?.value || 'current-month';
            const reportType = document.getElementById('pdf-report-type')?.value || 'complete';
            
            let startDate, endDate;
            const now = new Date();
            
            switch (period) {
                case 'current-month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    break;
                case 'last-month':
                    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                    break;
                case 'current-year':
                    startDate = new Date(now.getFullYear(), 0, 1);
                    endDate = new Date(now.getFullYear(), 11, 31);
                    break;
                case 'last-year':
                    startDate = new Date(now.getFullYear() - 1, 0, 1);
                    endDate = new Date(now.getFullYear() - 1, 11, 31);
                    break;
                default: // all
                    startDate = new Date(2000, 0, 1);
                    endDate = new Date(2100, 0, 1);
            }
            
            const transactions = await this.getCachedTransactions();
            const investments = await this.getCachedInvestments();
            const limits = await this.getAllLimits();
            
            const filteredTransactions = transactions.filter(t => {
                try {
                    const date = new Date(t.date);
                    return date >= startDate && date <= endDate;
                } catch {
                    return false;
                }
            });
            
            const monthlyIncome = filteredTransactions
                .filter(t => t.type === 'Receita')
                .reduce((sum, t) => sum + t.value, 0);
            
            const monthlyExpense = filteredTransactions
                .filter(t => t.type === 'Despesa')
                .reduce((sum, t) => sum + t.value, 0);
            
            const totalInvestment = investments
                .reduce((sum, inv) => sum + inv.currentValue, 0);
            
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // Título
            doc.setFontSize(20);
            doc.text('RELATÓRIO FINANCEIRO COMPLETO', 14, 22);
            
            // Data
            doc.setFontSize(11);
            doc.text(`Período: ${startDate.toLocaleDateString('pt-BR')} até ${endDate.toLocaleDateString('pt-BR')}`, 14, 32);
            doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 40);
            
            // Resumo Executivo (Página 1)
            doc.setFontSize(14);
            doc.text('RESUMO EXECUTIVO', 14, 55);
            
            doc.setFontSize(11);
            doc.text(`Receitas: R$ ${monthlyIncome.toFixed(2).replace('.', ',')}`, 14, 65);
            doc.text(`Despesas: R$ ${monthlyExpense.toFixed(2).replace('.', ',')}`, 14, 73);
            doc.text(`Saldo: R$ ${(monthlyIncome - monthlyExpense).toFixed(2).replace('.', ',')}`, 14, 81);
            doc.text(`Investimentos: R$ ${totalInvestment.toFixed(2).replace('.', ',')}`, 14, 89);
            
            // Top Despesas por Categoria
            const expenseTransactions = filteredTransactions.filter(t => t.type === 'Despesa');
            const categories = [...new Set(expenseTransactions.map(t => t.category))];
            const categoryTotals = categories.map(category => ({
                category,
                total: expenseTransactions
                    .filter(t => t.category === category)
                    .reduce((sum, t) => sum + t.value, 0)
            })).sort((a, b) => b.total - a.total).slice(0, 6);
            
            const totalExpenses = categoryTotals.reduce((sum, cat) => sum + cat.total, 0);
            
            doc.setFontSize(14);
            doc.text('TOP 6 - DESPESAS POR CATEGORIA', 14, 105);
            
            let yPos = 115;
            doc.setFontSize(10);
            doc.text('CATEGORIA', 14, yPos);
            doc.text('VALOR', 100, yPos);
            doc.text('%', 140, yPos);
            doc.text('MÉDIA/MÊS', 160, yPos);
            
            yPos += 8;
            doc.setFontSize(9);
            
            categoryTotals.forEach(cat => {
                const percentage = totalExpenses > 0 ? (cat.total / totalExpenses * 100) : 0;
                const avgMonthly = cat.total; // Simplificado
                
                doc.text(cat.category, 14, yPos);
                doc.text(`R$ ${cat.total.toFixed(2).replace('.', ',')}`, 100, yPos);
                doc.text(`${percentage.toFixed(1)}%`, 140, yPos);
                doc.text(`R$ ${avgMonthly.toFixed(2).replace('.', ',')}`, 160, yPos);
                yPos += 6;
            });
            
            doc.addPage();
            
            // Transações Recentes (Página 2)
            doc.setFontSize(14);
            doc.text('TRANSAÇÕES RECENTES', 14, 22);
            
            const headers = [['DATA', 'TIPO', 'CATEGORIA', 'DESCRIÇÃO', 'VALOR']];
            const recentTransactions = filteredTransactions
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 10);
            
            const rows = recentTransactions.map(t => [
                new Date(t.date).toLocaleDateString('pt-BR'),
                t.type === 'Receita' ? 'Rec' : 'Des',
                t.category,
                t.description.length > 20 ? t.description.substring(0, 20) + '...' : t.description,
                `${t.type === 'Receita' ? '+' : '-'} R$ ${t.value.toFixed(2).replace('.', ',')}`
            ]);
            
            doc.autoTable({
                head: headers,
                body: rows,
                startY: 30,
                styles: { fontSize: 8 },
                headStyles: { fillColor: [66, 83, 226] },
                columnStyles: {
                    0: { cellWidth: 25 },
                    1: { cellWidth: 15 },
                    2: { cellWidth: 30 },
                    3: { cellWidth: 60 },
                    4: { cellWidth: 30 }
                }
            });
            
            // Recomendações (final da página 2)
            const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 15 : 150;
            doc.setFontSize(11);
            doc.text('RECOMENDAÇÕES E CONSIDERAÇÕES', 14, finalY);
            
            doc.setFontSize(9);
            const recommendations = [
                `- A categoria "${categoryTotals[0]?.category || 'N/A'}" representa ${categoryTotals[0] ? (categoryTotals[0].total / totalExpenses * 100).toFixed(1) : '0'}% dos seus gastos.`,
                '- Considere rever esses custos para otimizar seus gastos.',
                monthlyIncome > monthlyExpense 
                    ? '- Parabéns! Seu saldo é positivo. Continue mantendo o controle financeiro.'
                    : '- Atenção: suas despesas estão maiores que suas receitas.',
                totalInvestment > 0
                    ? '- Continue investindo para multiplicar seu patrimônio.'
                    : '- Considere começar a investir parte do seu saldo.'
            ];
            
            let recY = finalY + 10;
            recommendations.forEach(rec => {
                doc.text(rec, 14, recY);
                recY += 6;
            });
            
            // Rodapé
            doc.setFontSize(8);
            doc.text('Sistema Financeiro v4.2', 14, 280);
            doc.text(`Página 1 de 2`, 180, 280);
            
            // Salvar
            doc.save('relatorio_financeiro.pdf');
            this.showAlert('Relatório PDF completo gerado com sucesso!', 'success');
            
        } catch (error) {
            console.error('Erro ao gerar relatório PDF:', error);
            this.showAlert('Erro ao gerar relatório PDF', 'danger');
        }
    }

    async handleFileUpload(files) {
        if (!files || files.length === 0) return;
        
        const file = files[0];
        console.log('🔍 Arquivo selecionado para importação:', {
            nome: file.name,
            tamanho: file.size,
            tipo: file.type,
            extensao: file.name.split('.').pop()
        });
        
        const progressElement = document.getElementById('import-progress');
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        
        if (progressElement) progressElement.style.display = 'block';
        if (progressFill) progressFill.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
        
        try {
            if (file.name.endsWith('.json')) {
                // Processar JSON
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const content = JSON.parse(e.target.result);
                        let importedCount = 0;
                        
                        // Atualizar progresso
                        if (progressFill) progressFill.style.width = '30%';
                        if (progressText) progressText.textContent = '30%';
                        
                        // Processar transações
                        if (content.transactions && Array.isArray(content.transactions)) {
                            for (const transaction of content.transactions) {
                                try {
                                    // Garantir que a transação tenha todos os campos necessários
                                    const completeTransaction = {
                                        ...transaction,
                                        status: transaction.status || 'pending',
                                        createdAt: transaction.createdAt || new Date().toISOString(),
                                        updatedAt: new Date().toISOString()
                                    };
                                    await this.addTransaction(completeTransaction);
                                    importedCount++;
                                } catch (error) {
                                    console.error('❌ Erro ao importar transação:', error);
                                }
                            }
                        }
                        
                        // Processar investimentos
                        if (content.investments && Array.isArray(content.investments)) {
                            for (const investment of content.investments) {
                                try {
                                    const completeInvestment = {
                                        ...investment,
                                        createdAt: investment.createdAt || new Date().toISOString(),
                                        updatedAt: new Date().toISOString()
                                    };
                                    await this.addInvestment(completeInvestment);
                                    importedCount++;
                                } catch (error) {
                                    console.error('❌ Erro ao importar investimento:', error);
                                }
                            }
                        }
                        
                        // Processar configurações
                        if (content.settings) {
                            for (const [key, value] of Object.entries(content.settings)) {
                                try {
                                    await this.saveSetting(key, value);
                                } catch (error) {
                                    console.error('❌ Erro ao importar configuração:', error);
                                }
                            }
                        }
                        
                        if (progressFill) progressFill.style.width = '100%';
                        if (progressText) progressText.textContent = '100%';
                        
                        setTimeout(async () => {
                            if (progressElement) progressElement.style.display = 'none';
                            this.showAlert(`${importedCount} registros importados com sucesso!`, 'success');
                            // Limpar cache
                            this.cache.transactions = null;
                            this.cache.investments = null;
                            this.cache.categories = null;
                            await this.loadInitialData();
                        }, 500);
                        
                    } catch (error) {
                        console.error('❌ Erro ao processar JSON:', error);
                        this.showAlert('Erro ao processar arquivo JSON', 'danger');
                        if (progressElement) progressElement.style.display = 'none';
                    }
                };
                reader.readAsText(file);
                
            } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                // Verificar se XLSX está disponível
                if (typeof XLSX === 'undefined') {
                    this.showAlert('Biblioteca XLSX não carregada. Certifique-se de incluir a biblioteca SheetJS.', 'danger');
                    if (progressElement) progressElement.style.display = 'none';
                    return;
                }
                
                // Processar Excel
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        console.log('📊 Iniciando processamento do Excel...');
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { 
                            type: 'array', 
                            cellDates: true,
                            cellNF: false,
                            cellText: false
                        });
                        
                        let importedCount = 0;
                        const allTransactions = [];
                        
                        // Atualizar progresso
                        if (progressFill) progressFill.style.width = '10%';
                        if (progressText) progressText.textContent = '10%';
                        
                        console.log('📋 Planilhas disponíveis:', workbook.SheetNames);
                        
                        // Processar cada aba
                        for (let sheetIndex = 0; sheetIndex < workbook.SheetNames.length; sheetIndex++) {
                            const sheetName = workbook.SheetNames[sheetIndex];
                            console.log(`📝 Processando aba: "${sheetName}"`);
                            
                            const worksheet = workbook.Sheets[sheetName];
                            
                            // Converter para JSON
                            const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                                header: 1,
                                raw: false,
                                defval: '',
                                dateNF: 'yyyy-mm-dd'
                            });
                            
                            console.log(`📈 Total de linhas na planilha "${sheetName}": ${jsonData.length}`);
                            
                            if (jsonData.length < 2) {
                                console.warn(`⚠️ Planilha "${sheetName}" vazia ou com poucas linhas`);
                                continue;
                            }
                            
                            // Extrair cabeçalhos (primeira linha)
                            const rawHeaders = jsonData[0];
                            const headers = rawHeaders.map(h => {
                                if (h === null || h === undefined) return '';
                                return String(h).trim();
                            });
                            
                            console.log('🏷️ Cabeçalhos encontrados:', headers);
                            
                            // Mostrar primeiras linhas para debug
                            console.log('🔍 Primeiras 3 linhas de dados:');
                            for (let i = 1; i < Math.min(4, jsonData.length); i++) {
                                console.log(`Linha ${i}:`, jsonData[i]);
                            }
                            
                            // Processar cada linha de dados
                            for (let i = 1; i < jsonData.length; i++) {
                                const rowArray = jsonData[i];
                                
                                // Pular linhas vazias
                                if (!rowArray || rowArray.length === 0 || rowArray.every(cell => !cell || cell.toString().trim() === '')) {
                                    continue;
                                }
                                
                                // Converter array para objeto usando cabeçalhos
                                const row = {};
                                headers.forEach((header, colIndex) => {
                                    if (header && header.trim() !== '' && colIndex < rowArray.length) {
                                        let value = rowArray[colIndex];
                                        
                                        // Converter datas do Excel
                                        if (value instanceof Date) {
                                            value = value.toISOString().split('T')[0];
                                        } else if (typeof value === 'string' && value.includes('/') && !isNaN(Date.parse(value))) {
                                            // Tentar parsear como data
                                            try {
                                                const date = new Date(value);
                                                if (!isNaN(date.getTime())) {
                                                    value = date.toISOString().split('T')[0];
                                                }
                                            } catch (e) {
                                                // Manter como string
                                            }
                                        }
                                        
                                        row[header] = value;
                                    }
                                });
                                
                                console.log(`📄 Processando linha ${i}:`, row);
                                
                                // Verificar se é uma transação (tem colunas mínimas)
                                const hasRequiredFields = (row.Data || row.Date) && (row.Tipo || row.Type) && 
                                                          (row.Categoria || row.Category) && (row.Valor || row.Value);
                                
                                if (hasRequiredFields) {
                                    try {
                                        const transaction = this.parseTransactionRow(row);
                                        if (transaction) {
                                            console.log('✅ Transação válida:', transaction);
                                            allTransactions.push(transaction);
                                        } else {
                                            console.warn('❌ Transação inválida (retornou null):', row);
                                        }
                                    } catch (error) {
                                        console.error('❌ Erro ao processar linha como transação:', error, row);
                                    }
                                } else {
                                    console.log('📋 Linha ignorada (faltam campos obrigatórios):', row);
                                }
                            }
                            
                            // Atualizar progresso
                            const sheetProgress = 10 + ((sheetIndex + 1) / workbook.SheetNames.length * 60);
                            if (progressFill) progressFill.style.width = `${Math.min(sheetProgress, 70)}%`;
                            if (progressText) progressText.textContent = `${Math.floor(Math.min(sheetProgress, 70))}%`;
                        }
                        
                        console.log(`✅ Total de transações encontradas: ${allTransactions.length}`);
                        
                        // Atualizar progresso para salvar
                        if (progressFill) progressFill.style.width = '80%';
                        if (progressText) progressText.textContent = '80%';
                        
                        // SALVAR TRANSAÇÕES NO BANCO DE DADOS
                        for (let i = 0; i < allTransactions.length; i++) {
                            const transaction = allTransactions[i];
                            try {
                                console.log(`💾 Salvando transação ${i + 1}/${allTransactions.length}:`, transaction);
                                await this.addTransaction(transaction);
                                importedCount++;
                                
                                // Atualizar progresso a cada 10 transações
                                if (i % 10 === 0) {
                                    const saveProgress = 80 + ((i / allTransactions.length) * 20);
                                    if (progressFill) progressFill.style.width = `${saveProgress}%`;
                                    if (progressText) progressText.textContent = `${Math.floor(saveProgress)}%`;
                                }
                            } catch (error) {
                                console.error('❌ Erro ao salvar transação no banco:', error, transaction);
                            }
                        }
                        
                        if (progressFill) progressFill.style.width = '100%';
                        if (progressText) progressText.textContent = '100%';
                        
                        setTimeout(() => {
                            if (progressElement) progressElement.style.display = 'none';
                            if (importedCount > 0) {
                                this.showAlert(`✅ Importadas ${importedCount} transações com sucesso!`, 'success');
                            } else {
                                this.showAlert('⚠️ Nenhuma transação foi importada. Verifique o formato do arquivo.', 'warning');
                            }
                            // Limpar cache
                            this.cache.transactions = null;
                            this.loadInitialData();
                        }, 1000);
                        
                    } catch (error) {
                        console.error('❌ Erro ao processar Excel:', error);
                        this.showAlert(`Erro ao processar arquivo Excel: ${error.message}`, 'danger');
                        if (progressElement) progressElement.style.display = 'none';
                    }
                };
                reader.onerror = (error) => {
                    console.error('❌ Erro ao ler arquivo Excel:', error);
                    this.showAlert('Erro ao ler arquivo Excel', 'danger');
                    if (progressElement) progressElement.style.display = 'none';
                };
                reader.readAsArrayBuffer(file);
                
            } else if (file.name.endsWith('.csv')) {
                // Processar CSV
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        console.log('📊 Iniciando processamento do CSV...');
                        const content = e.target.result;
                        
                        let importedCount = 0;
                        const allTransactions = [];
                        
                        // Atualizar progresso
                        if (progressFill) progressFill.style.width = '10%';
                        if (progressText) progressText.textContent = '10%';
                        
                        // Converter CSV para linhas
                        const lines = content.split('\n').filter(line => line.trim() !== '');
                        console.log(`📈 Total de linhas no CSV: ${lines.length}`);
                        
                        if (lines.length < 2) {
                            this.showAlert('Arquivo CSV vazio ou inválido', 'warning');
                            if (progressElement) progressElement.style.display = 'none';
                            return;
                        }
                        
                        // Detectar separador
                        let separator = ',';
                        if (lines[0].includes(';') && !lines[0].includes(',')) {
                            separator = ';';
                        } else if (lines[0].includes('\t')) {
                            separator = '\t';
                        }
                        
                        console.log(`🔧 Separador detectado: "${separator}"`);
                        
                        // Processar cabeçalho
                        const rawHeaders = lines[0].split(separator).map(h => h.trim());
                        const headers = rawHeaders.map(h => {
                            // Remover BOM character e aspas
                            return h
                                .replace(/^\uFEFF/, '')
                                .replace(/^["'](.*)["']$/, '$1')
                                .trim();
                        });
                        
                        console.log('🏷️ Cabeçalhos CSV:', headers);
                        
                        if (progressFill) progressFill.style.width = '30%';
                        if (progressText) progressText.textContent = '30%';
                        
                        // Processar cada linha
                        for (let i = 1; i < lines.length; i++) {
                            const line = lines[i].trim();
                            if (!line) continue;
                            
                            try {
                                // Processar linha CSV considerando aspas
                                const values = [];
                                let current = '';
                                let insideQuotes = false;
                                
                                for (let char of line) {
                                    if (char === '"') {
                                        insideQuotes = !insideQuotes;
                                    } else if (char === separator && !insideQuotes) {
                                        values.push(current.trim());
                                        current = '';
                                    } else {
                                        current += char;
                                    }
                                }
                                values.push(current.trim());
                                
                                // Criar objeto da linha
                                const row = {};
                                headers.forEach((header, index) => {
                                    if (header && header !== '' && index < values.length) {
                                        let value = values[index];
                                        // Remover aspas extras
                                        value = value.replace(/^["'](.*)["']$/, '$1').trim();
                                        row[header] = value;
                                    }
                                });
                                
                                console.log(`📄 Processando linha ${i}:`, row);
                                
                                // Verificar se é uma transação
                                if (row.Data || row.Tipo || row.Categoria || row.Valor) {
                                    const transaction = this.parseTransactionRow(row);
                                    if (transaction) {
                                        console.log('✅ Transação CSV válida:', transaction);
                                        allTransactions.push(transaction);
                                    }
                                }
                                
                            } catch (error) {
                                console.error(`❌ Erro ao processar linha ${i} do CSV:`, error, line);
                            }
                            
                            // Atualizar progresso
                            const lineProgress = 30 + ((i / lines.length) * 50);
                            if (progressFill) progressFill.style.width = `${Math.min(lineProgress, 80)}%`;
                            if (progressText) progressText.textContent = `${Math.floor(Math.min(lineProgress, 80))}%`;
                        }
                        
                        console.log(`✅ Total de transações CSV encontradas: ${allTransactions.length}`);
                        
                        if (progressFill) progressFill.style.width = '80%';
                        if (progressText) progressText.textContent = '80%';
                        
                        // SALVAR DADOS NO BANCO
                        for (let i = 0; i < allTransactions.length; i++) {
                            const transaction = allTransactions[i];
                            try {
                                console.log(`💾 Salvando transação CSV ${i + 1}/${allTransactions.length}`);
                                await this.addTransaction(transaction);
                                importedCount++;
                            } catch (error) {
                                console.error('❌ Erro ao salvar transação CSV:', error);
                            }
                        }
                        
                        if (progressFill) progressFill.style.width = '100%';
                        if (progressText) progressText.textContent = '100%';
                        
                        setTimeout(() => {
                            if (progressElement) progressElement.style.display = 'none';
                            if (importedCount > 0) {
                                this.showAlert(`✅ Importadas ${importedCount} transações do CSV!`, 'success');
                            } else {
                                this.showAlert('⚠️ Nenhuma transação importada do CSV. Verifique o formato.', 'warning');
                            }
                            // Limpar cache
                            this.cache.transactions = null;
                            this.loadInitialData();
                        }, 500);
                        
                    } catch (error) {
                        console.error('❌ Erro ao processar CSV:', error);
                        this.showAlert('Erro ao processar arquivo CSV', 'danger');
                        if (progressElement) progressElement.style.display = 'none';
                    }
                };
                reader.onerror = (error) => {
                    console.error('❌ Erro ao ler arquivo CSV:', error);
                    this.showAlert('Erro ao ler arquivo CSV', 'danger');
                    if (progressElement) progressElement.style.display = 'none';
                };
                reader.readAsText(file, 'UTF-8');
                
            } else {
                this.showAlert('Formato de arquivo não suportado. Use XLSX, CSV ou JSON.', 'warning');
                if (progressElement) progressElement.style.display = 'none';
            }
            
        } catch (error) {
            console.error('❌ Erro no upload:', error);
            this.showAlert('Erro ao processar arquivo', 'danger');
            if (progressElement) progressElement.style.display = 'none';
        }
    }

    parseTransactionRow(row) {
        try {
            console.log('🔧 ParseTransactionRow recebeu:', row);
            
            // Mapeamento flexível de colunas
            const dateRaw = row.Data || row.Date || row['Data de Vencimento'] || row.data || row.date || '';
            const type = row.Tipo || row.Type || row.tipo || row.type || '';
            const category = row.Categoria || row.Category || row.categoria || row.category || '';
            const description = row.Descrição || row.Description || row.descrição || row.description || 
                               row.descricao || row.Descricao || '';
            const statusRaw = row.Situação || row.Status || row.situação || row.status || 
                             row.Situacao || row.situacao || 'Pendente';
            const classification = row.Classificação || row.Classification || row.classificação || 
                                  row.classification || row.Classificacao || row.classificacao || '';
            const subcategory = row.Subcategoria || row.Subcategory || row.subcategoria || 
                               row.subcategory || row.SubCategoria || row.SubCategory || '';
            const notes = row.Observações || row.Observations || row.observações || row.observations || 
                          row.Observacoes || row.observacoes || '';
            
            // Processar valor - múltiplos formatos
            let rawValue = row.Valor || row.Value || row.valor || row.value || 
                          row['Valor (R$)'] || row['Valor R$'] || '0';
            
            let value = 0;
            
            // Limpar e converter o valor
            if (rawValue !== null && rawValue !== undefined) {
                const strValue = String(rawValue).trim();
                
                if (strValue === '' || strValue.toLowerCase() === 'null' || strValue.toLowerCase() === 'undefined') {
                    value = 0;
                } else {
                    // Remover símbolos de moeda e espaços
                    let cleanedValue = strValue
                        .replace(/\s/g, '')
                        .replace(/R\$/g, '')
                        .replace(/\$/g, '')
                        .replace(/€/g, '')
                        .replace(/£/g, '')
                        .replace(/[^\d.,\-]/g, '') // Manter apenas números, ponto, vírgula e sinal negativo
                        .trim();
                    
                    // Verificar se está vazio após limpeza
                    if (cleanedValue === '' || cleanedValue === '-') {
                        value = 0;
                    } else {
                        // Formato brasileiro: 1.234,56 -> 1234.56
                        if (cleanedValue.includes(',') && cleanedValue.includes('.')) {
                            // Se tem ambos, assume que vírgula é decimal e ponto é milhar
                            cleanedValue = cleanedValue.replace(/\./g, '').replace(',', '.');
                        } 
                        // Apenas vírgula como decimal
                        else if (cleanedValue.includes(',') && !cleanedValue.includes('.')) {
                            cleanedValue = cleanedValue.replace(',', '.');
                        }
                        // Formato americano: 1,234.56 -> 1234.56
                        else if (cleanedValue.includes('.') && cleanedValue.includes(',')) {
                            cleanedValue = cleanedValue.replace(/,/g, '');
                        }
                        
                        // Converter para número
                        value = parseFloat(cleanedValue);
                        
                        // Verificar se é NaN
                        if (isNaN(value)) {
                            console.warn('⚠️ Valor não pôde ser convertido:', strValue, '->', cleanedValue);
                            value = 0;
                        }
                    }
                }
            }
            
            console.log(`💰 Valor processado: "${rawValue}" -> ${value}`);
            
            // Verificar dados mínimos necessários
            if (!dateRaw || !type || !category || value === 0) {
                console.warn('⚠️ Dados insuficientes na linha:', {
                    dateRaw, type, category, value,
                    temData: !!dateRaw,
                    temTipo: !!type,
                    temCategoria: !!category,
                    temValor: value !== 0
                });
                return null;
            }
            
            // Converter data
            let isoDate;
            try {
                const dateStr = String(dateRaw).trim();
                console.log(`📅 Data original: "${dateStr}"`);
                
                // Tentar diferentes formatos de data
                // Formato YYYY-MM-DD (com ou sem hora)
                if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
                    isoDate = dateStr.split(' ')[0]; // Remove hora se existir
                    console.log(`📅 Formato YYYY-MM-DD detectado: ${isoDate}`);
                }
                // Formato DD/MM/YYYY
                else if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(dateStr)) {
                    const parts = dateStr.split('/');
                    const day = parts[0].padStart(2, '0');
                    const month = parts[1].padStart(2, '0');
                    const year = parts[2];
                    isoDate = `${year}-${month}-${day}`;
                    console.log(`📅 Formato DD/MM/YYYY detectado: ${isoDate}`);
                }
                // Formato DD-MM-YYYY
                else if (/^\d{1,2}-\d{1,2}-\d{4}/.test(dateStr)) {
                    const parts = dateStr.split('-');
                    const day = parts[0].padStart(2, '0');
                    const month = parts[1].padStart(2, '0');
                    const year = parts[2];
                    isoDate = `${year}-${month}-${day}`;
                    console.log(`📅 Formato DD-MM-YYYY detectado: ${isoDate}`);
                }
                // Formato MM/DD/YYYY (americano)
                else if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(dateStr)) {
                    const dateObj = new Date(dateStr);
                    if (!isNaN(dateObj.getTime())) {
                        isoDate = dateObj.toISOString().split('T')[0];
                        console.log(`📅 Formato MM/DD/YYYY detectado: ${isoDate}`);
                    }
                }
                // Tentar parsear como data padrão
                else {
                    const dateObj = new Date(dateStr);
                    if (!isNaN(dateObj.getTime())) {
                        isoDate = dateObj.toISOString().split('T')[0];
                        console.log(`📅 Data parseada: ${isoDate}`);
                    } else {
                        // Se não conseguir parsear, usar data atual
                        isoDate = new Date().toISOString().split('T')[0];
                        console.warn(`⚠️ Não foi possível parsear a data "${dateStr}", usando data atual: ${isoDate}`);
                    }
                }
            } catch (error) {
                console.error('❌ Erro ao converter data:', error);
                isoDate = new Date().toISOString().split('T')[0];
            }
            
            // Normalizar status
            let status = 'pending';
            if (statusRaw) {
                const statusLower = String(statusRaw).toLowerCase();
                if (statusLower.includes('paga') || statusLower.includes('paid') || statusLower === 'pago') {
                    status = 'paid';
                } else if (statusLower.includes('pendente') || statusLower.includes('pending')) {
                    status = 'pending';
                } else if (statusLower.includes('vencida') || statusLower.includes('overdue')) {
                    status = 'pending'; // Marcar como pendente se estiver vencida
                }
            }
            
            // Normalizar tipo
            let normalizedType = String(type).trim();
            if (normalizedType.toLowerCase().includes('receita') || normalizedType.toLowerCase().includes('income')) {
                normalizedType = 'Receita';
            } else if (normalizedType.toLowerCase().includes('despesa') || normalizedType.toLowerCase().includes('expense')) {
                normalizedType = 'Despesa';
            }
            
            // Criar objeto de transação
            const transaction = {
                date: isoDate,
                type: normalizedType,
                category: String(category).trim(),
                value: parseFloat(value.toFixed(2)), // Garantir 2 casas decimais
                description: String(description).trim() || '(sem descrição)',
                status: status,
                classification: classification ? String(classification).trim() : null,
                subcategory: subcategory ? String(subcategory).trim() : null,
                notes: notes ? String(notes).trim() : null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            console.log('✅ Transação final processada:', transaction);
            return transaction;
            
        } catch (error) {
            console.error('❌ Erro crítico no parseTransactionRow:', error, row);
            return null;
        }
    }

    async clearAllData() {
        try {
            if (!confirm('⚠️ TEM CERTEZA QUE DESEJA APAGAR TODOS OS DADOS?\n\nEsta ação NÃO pode ser desfeita e todos os seus registros serão perdidos permanentemente.')) {
                return;
            }
            
            // Limpar todas as stores
            const transaction = this.db.transaction(
                ['transactions', 'investments', 'limits'], 
                'readwrite'
            );
            
            // Limpar transações
            await new Promise((resolve, reject) => {
                const request = transaction.objectStore('transactions').clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
            
            // Limpar investimentos
            await new Promise((resolve, reject) => {
                const request = transaction.objectStore('investments').clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
            
            // Limpar limites
            await new Promise((resolve, reject) => {
                const request = transaction.objectStore('limits').clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
            
            // Limpar cache
            this.cache.transactions = null;
            this.cache.investments = null;
            this.cache.categories = null;
            this.cache.lastUpdate = null;
            
            // Restaurar configurações padrão
            await this.ensureDefaultSettings();
            
            this.showAlert('Todos os dados foram apagados com sucesso!', 'success');
            await this.loadInitialData();
            
        } catch (error) {
            console.error('Erro ao limpar dados:', error);
            this.showAlert('Erro ao limpar dados', 'danger');
        }
    }

    // ========== MÉTODOS DO INDEXEDDB ==========

    async addTransaction(transaction) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Banco de dados não inicializado'));
                return;
            }
            
            const tx = this.db.transaction(['transactions'], 'readwrite');
            const store = tx.objectStore('transactions');
            const request = store.add(transaction);
            
            request.onsuccess = () => {
                console.log('✅ Transação adicionada com ID:', request.result);
                resolve(request.result);
            };
            request.onerror = () => {
                console.error('❌ Erro ao adicionar transação:', request.error);
                reject(request.error);
            };
        });
    }

    async getTransaction(id) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Banco de dados não inicializado'));
                return;
            }
            
            const tx = this.db.transaction(['transactions'], 'readonly');
            const store = tx.objectStore('transactions');
            const request = store.get(id);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllTransactions() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Banco de dados não inicializado'));
                return;
            }
            
            const tx = this.db.transaction(['transactions'], 'readonly');
            const store = tx.objectStore('transactions');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async updateTransaction(transaction) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Banco de dados não inicializado'));
                return;
            }
            
            if (!transaction.id) {
                reject(new Error('Transação não tem ID'));
                return;
            }
            
            const tx = this.db.transaction(['transactions'], 'readwrite');
            const store = tx.objectStore('transactions');
            const request = store.put(transaction);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteTransaction(id) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Banco de dados não inicializado'));
                return;
            }
            
            const tx = this.db.transaction(['transactions'], 'readwrite');
            const store = tx.objectStore('transactions');
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async addInvestment(investment) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Banco de dados não inicializado'));
                return;
            }
            
            const tx = this.db.transaction(['investments'], 'readwrite');
            const store = tx.objectStore('investments');
            const request = store.add(investment);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getInvestment(id) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Banco de dados não inicializado'));
                return;
            }
            
            const tx = this.db.transaction(['investments'], 'readonly');
            const store = tx.objectStore('investments');
            const request = store.get(id);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllInvestments() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Banco de dados não inicializado'));
                return;
            }
            
            const tx = this.db.transaction(['investments'], 'readonly');
            const store = tx.objectStore('investments');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async updateInvestment(investment) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Banco de dados não inicializado'));
                return;
            }
            
            if (!investment.id) {
                reject(new Error('Investimento não tem ID'));
                return;
            }
            
            const tx = this.db.transaction(['investments'], 'readwrite');
            const store = tx.objectStore('investments');
            const request = store.put(investment);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteInvestment(id) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Banco de dados não inicializado'));
                return;
            }
            
            const tx = this.db.transaction(['investments'], 'readwrite');
            const store = tx.objectStore('investments');
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async addLimit(limit) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Banco de dados não inicializado'));
                return;
            }
            
            const tx = this.db.transaction(['limits'], 'readwrite');
            const store = tx.objectStore('limits');
            const request = store.add(limit);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllLimits() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Banco de dados não inicializado'));
                return;
            }
            
            const tx = this.db.transaction(['limits'], 'readonly');
            const store = tx.objectStore('limits');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteLimit(id) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Banco de dados não inicializado'));
                return;
            }
            
            const tx = this.db.transaction(['limits'], 'readwrite');
            const store = tx.objectStore('limits');
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getSetting(key) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Banco de dados não inicializado'));
                return;
            }
            
            const tx = this.db.transaction(['settings'], 'readonly');
            const store = tx.objectStore('settings');
            const request = store.get(key);
            
            request.onsuccess = () => resolve(request.result ? request.result.value : null);
            request.onerror = () => reject(request.error);
        });
    }

    async saveSetting(key, value) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Banco de dados não inicializado'));
                return;
            }
            
            const tx = this.db.transaction(['settings'], 'readwrite');
            const store = tx.objectStore('settings');
            const request = store.put({ key, value });
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.checked = theme === 'dark';
        }
    }

    async loadSettings() {
        const theme = await this.getSetting('theme') || 'light';
        this.setTheme(theme);
    }

    showAlert(message, type = 'info') {
        try {
            // Remover alertas existentes
            const existingAlerts = document.querySelectorAll('.alert-toast');
            existingAlerts.forEach(alert => alert.remove());
            
            // Criar alerta
            const alert = document.createElement('div');
            alert.className = `alert-toast ${type}`;
            
            const icons = {
                success: 'check-circle',
                warning: 'exclamation-triangle',
                danger: 'times-circle',
                info: 'info-circle'
            };
            
            alert.innerHTML = `
                <i class="fas fa-${icons[type] || 'info-circle'}"></i>
                <span>${message}</span>
                <button class="close-alert">&times;</button>
            `;
            
            // Estilos do alerta
            Object.assign(alert.style, {
                position: 'fixed',
                top: '20px',
                right: '20px',
                padding: '16px 20px',
                background: type === 'success' ? 'var(--success-color)' : 
                            type === 'warning' ? 'var(--warning-color)' : 
                            type === 'danger' ? 'var(--danger-color)' : 'var(--info-color)',
                color: 'white',
                borderRadius: '8px',
                boxShadow: 'var(--shadow)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                zIndex: '3000',
                animation: 'slideIn 0.3s ease'
            });
            
            // Animação
            const style = document.createElement('style');
            style.textContent = `
                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes slideOut {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
            
            document.body.appendChild(alert);
            
            // Botão de fechar
            alert.querySelector('.close-alert').addEventListener('click', () => {
                alert.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => alert.remove(), 300);
            });
            
            // Auto-remover após 5 segundos
            setTimeout(() => {
                if (alert.parentNode) {
                    alert.style.animation = 'slideOut 0.3s ease';
                    setTimeout(() => alert.remove(), 300);
                }
            }, 5000);
            
        } catch (error) {
            console.error('Erro ao mostrar alerta:', error);
        }
    }
}

// Inicializar a aplicação quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.financeApp = new FinanceApp();
        console.log('🚀 Aplicação Financeira Inicializada - Versão 4.2');
    } catch (error) {
        console.error('❌ Erro ao inicializar aplicação:', error);
        alert('Erro ao inicializar o sistema financeiro. Por favor, recarregue a página.');
    }
});

// Adicionar estilos para badges e melhorias visuais
const badgeStyles = document.createElement('style');
badgeStyles.textContent = `
    .badge {
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
        display: inline-block;
    }
    
    .badge.success {
        background-color: rgba(76, 201, 240, 0.15);
        color: var(--success-color);
    }
    
    .badge.danger {
        background-color: rgba(247, 37, 133, 0.15);
        color: var(--danger-color);
    }
    
    .badge.warning {
        background-color: rgba(248, 150, 30, 0.15);
        color: var(--warning-color);
    }
    
    .badge.info {
        background-color: rgba(130, 87, 229, 0.15);
        color: var(--info-color);
    }
    
    .empty-state {
        text-align: center;
        padding: 40px 20px;
        color: var(--text-secondary);
    }
    
    .empty-state i {
        font-size: 48px;
        margin-bottom: 16px;
        opacity: 0.5;
    }
    
    .empty-state p {
        font-size: 14px;
    }
    
    .empty-hint {
        font-size: 12px;
        color: var(--text-tertiary);
        margin-top: 8px;
    }
    
    .progress-bar {
        width: 100%;
        height: 8px;
        background-color: var(--border-color);
        border-radius: 4px;
        overflow: hidden;
        margin: 8px 0;
    }
    
    .progress-fill {
        height: 100%;
        background-color: var(--primary-color);
        transition: width 0.3s ease;
    }
    
    .progress-text {
        font-size: 12px;
        color: var(--text-secondary);
    }
    
    .chart-wrapper {
        position: relative;
        width: 100%;
        min-height: 250px;
    }
    
    .chart-container {
        position: relative;
        height: 100%;
        width: 100%;
    }
    
    /* Estilos para a aba de Alertas/Limites */
    .limits-table .table-actions {
        display: flex;
        gap: 8px;
    }
    
    .action-btn.add-limit {
        background-color: var(--success-color);
        color: white;
    }
    
    .action-btn.add-limit:hover {
        background-color: var(--success-dark);
    }
    
    /* Melhorias visuais para gráficos */
    .chart-card {
        background: var(--card-bg);
        border-radius: 12px;
        padding: 20px;
        box-shadow: var(--shadow);
        transition: transform 0.3s ease;
    }
    
    .chart-card:hover {
        transform: translateY(-2px);
    }
    
    .chart-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
    }
    
    .chart-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--text-color);
    }
    
    .chart-controls {
        display: flex;
        gap: 10px;
    }
`;
document.head.appendChild(badgeStyles);

// Adicionar polyfill para compatibilidade
if (!window.indexedDB) {
    console.warn('IndexedDB não suportado neste navegador');
    alert('Seu navegador não suporta IndexedDB, que é necessário para este aplicativo. Por favor, use um navegador moderno como Chrome, Firefox ou Edge.');
}

// Verificar se Chart.js está carregado
if (typeof Chart === 'undefined') {
    console.error('Chart.js não foi carregado. Certifique-se de incluir a biblioteca Chart.js.');
    document.addEventListener('DOMContentLoaded', () => {
        const chartContainers = document.querySelectorAll('.chart-wrapper');
        chartContainers.forEach(container => {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Biblioteca Chart.js não encontrada</p>
                    <p class="empty-hint">Por favor, inclua a biblioteca Chart.js para visualizar os gráficos</p>
                </div>
            `;
        });
    });
}
// [file content end]