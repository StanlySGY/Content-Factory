import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./onboarding.css";

const STEPS = [
  { id: "welcome", title: "欢迎使用 Content Factory" },
  { id: "profile", title: "基础配置" },
  { id: "tutorial", title: "创建第一篇文章" },
  { id: "complete", title: "完成" },
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [config, setConfig] = useState({
    username: "",
    language: "zh-CN",
  });

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      localStorage.setItem("onboarding_completed", "true");
      localStorage.setItem("user_config", JSON.stringify(config));
      navigate("/");
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem("onboarding_completed", "true");
    navigate("/");
  };

  const canProceed = () => {
    if (currentStep === 1) return config.username.trim().length > 0;
    return true;
  };

  return (
    <div className="onboarding-container">
      <div className="onboarding-progress">
        {STEPS.map((step, index) => (
          <div
            key={step.id}
            className={`progress-step ${index === currentStep ? "active" : ""} ${index < currentStep ? "completed" : ""}`}
          >
            <div className="step-number">{index + 1}</div>
            <div className="step-title">{step.title}</div>
          </div>
        ))}
      </div>

      <div className="onboarding-content">
        {currentStep === 0 && <WelcomeStep />}
        {currentStep === 1 && <ProfileStep config={config} setConfig={setConfig} />}
        {currentStep === 2 && <TutorialStep />}
        {currentStep === 3 && <CompleteStep config={config} />}
      </div>

      <div className="onboarding-actions">
        {currentStep > 0 && currentStep < STEPS.length - 1 && (
          <button className="btn" onClick={handleBack}>
            上一步
          </button>
        )}
        <button className="btn text" onClick={handleSkip}>
          跳过引导
        </button>
        <button
          className="btn primary"
          onClick={handleNext}
          disabled={!canProceed()}
        >
          {currentStep === STEPS.length - 1 ? "开始使用" : "下一步"}
        </button>
      </div>
    </div>
  );
}

function WelcomeStep() {
  return (
    <div className="step-card welcome-step">
      <h1>欢迎使用 Content Factory</h1>
      <p className="subtitle">AI 驱动的内容生产平台</p>

      <div className="feature-grid">
        <div className="feature-item">
          <div className="feature-icon">🤖</div>
          <h3>智能内容生成</h3>
          <p>基于 AI Agent 的内容创作工作流</p>
        </div>
        <div className="feature-item">
          <div className="feature-icon">📝</div>
          <h3>富文本编辑</h3>
          <p>支持 Markdown 的强大编辑器</p>
        </div>
        <div className="feature-item">
          <div className="feature-icon">🚀</div>
          <h3>一键发布</h3>
          <p>直接发布到公众号等平台</p>
        </div>
        <div className="feature-item">
          <div className="feature-icon">📊</div>
          <h3>实时监控</h3>
          <p>WebSocket 实时追踪生成进度</p>
        </div>
      </div>
    </div>
  );
}

function ProfileStep({ config, setConfig }: { config: any; setConfig: any }) {
  return (
    <div className="step-card profile-step">
      <h2>基础配置</h2>
      <p className="hint">设置您的用户信息</p>

      <div className="form-group">
        <label htmlFor="username">用户名</label>
        <input
          id="username"
          type="text"
          placeholder="请输入用户名"
          value={config.username}
          onChange={(e) => setConfig({ ...config, username: e.target.value })}
        />
      </div>

      <div className="form-group">
        <label htmlFor="language">界面语言</label>
        <select
          id="language"
          value={config.language}
          onChange={(e) => setConfig({ ...config, language: e.target.value })}
        >
          <option value="zh-CN">简体中文</option>
          <option value="en-US">English</option>
        </select>
      </div>
    </div>
  );
}

function TutorialStep() {
  return (
    <div className="step-card tutorial-step">
      <h2>创建第一篇文章</h2>
      <p className="hint">了解 Content Factory 的核心功能</p>

      <div className="tutorial-content">
        <div className="tutorial-item">
          <div className="tutorial-number">1</div>
          <div className="tutorial-text">
            <h4>创建任务</h4>
            <p>点击"创建任务"按钮，选择内容模板或自定义主题</p>
          </div>
        </div>

        <div className="tutorial-item">
          <div className="tutorial-number">2</div>
          <div className="tutorial-text">
            <h4>AI 生成内容</h4>
            <p>系统将自动调用 AI 工作流生成初稿，实时显示进度</p>
          </div>
        </div>

        <div className="tutorial-item">
          <div className="tutorial-number">3</div>
          <div className="tutorial-text">
            <h4>编辑与润色</h4>
            <p>使用富文本编辑器修改内容，支持 Markdown 语法</p>
          </div>
        </div>

        <div className="tutorial-item">
          <div className="tutorial-number">4</div>
          <div className="tutorial-text">
            <h4>发布文章</h4>
            <p>一键发布到公众号等平台，或导出为本地文件</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompleteStep({ config }: { config: any }) {
  return (
    <div className="step-card complete-step">
      <div className="success-icon">✓</div>
      <h2>一切准备就绪！</h2>
      <p className="subtitle">您的配置已保存</p>

      <div className="config-summary">
        <div className="summary-item">
          <span className="summary-label">用户名：</span>
          <span className="summary-value">{config.username}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">语言：</span>
          <span className="summary-value">
            {config.language === "zh-CN" ? "简体中文" : "English"}
          </span>
        </div>
      </div>

      <p className="hint-text">
        点击"开始使用"进入工作台，开始创作您的第一篇文章
      </p>
    </div>
  );
}
