# A-Machine RunPod 배포 가이드

## 목적 Objective

GitHub를 기준 저장소로 사용하고 RunPod RTX 3090 GPU Pod에서 `A-Machine` Streamlit 앱을 실행합니다.

## 입력 Inputs

- GitHub repository URL
- RunPod RTX 3090 GPU Pod
- Gemini API key
- Hugging Face access, if the CSM model requires login

## 출력 Outputs

- RunPod Streamlit app URL
- Reproducible deployment flow using `git pull`

## 1. 로컬에서 GitHub로 올리기 Push From Local

아래 명령은 `app.py`가 있는 로컬 폴더에서 실행합니다.

```bash
git init
git add app.py requirements.txt runpod_start.sh README_RUNPOD.md .gitignore .env.example
git commit -m "Initial A-Machine Streamlit app"
git branch -M main
git remote add origin https://github.com/YOUR_ID/YOUR_REPO.git
git push -u origin main
```

이미 GitHub 저장소를 만들었다면 `YOUR_ID/YOUR_REPO`만 실제 값으로 바꾸면 됩니다.

## 2. RunPod에서 내려받기 Clone On RunPod

RunPod 터미널에서 실행합니다.

```bash
cd /workspace
git clone https://github.com/YOUR_ID/YOUR_REPO.git A-Machine_Workspace
cd A-Machine_Workspace
```

Private repository라면 GitHub personal access token 또는 SSH key 인증을 사용하세요.

## 3. 환경변수 설정 Set Environment Variables

```bash
cp .env.example .env
nano .env
```

`.env` 안의 `GEMINI_API_KEY` 값을 실제 키로 바꿉니다. `.env`는 `.gitignore`에 포함되어 GitHub에 올라가지 않습니다.

## 4. 실행 Run

```bash
bash runpod_start.sh
```

직접 실행하려면 아래 명령을 사용합니다.

```bash
apt-get update
apt-get install -y ffmpeg
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
streamlit run app.py --server.port 8501 --server.address 0.0.0.0
```

## 5. 접속 Open App

RunPod 콘솔에서 8501 포트를 열고 제공되는 HTTP URL로 접속합니다.

## 6. 업데이트 Update

로컬에서 코드를 수정한 뒤:

```bash
git add .
git commit -m "Update A-Machine"
git push
```

RunPod에서 최신 코드 반영:

```bash
cd /workspace/A-Machine_Workspace
git pull
bash runpod_start.sh
```

## 예외상황 Edge Cases

- `GEMINI_API_KEY` 오류: `.env` 또는 RunPod 환경변수를 확인합니다.
- CUDA 오류: GPU Pod인지, PyTorch CUDA 버전인지 확인합니다.
- GitHub 인증 실패: private repo는 token 또는 SSH key가 필요합니다.
- 모델 다운로드 지연: 첫 실행 시 `sesame/csm-1b` 다운로드 시간이 걸릴 수 있습니다.

## 유지보수 Maintenance

- Python 패키지 변경은 `requirements.txt`에 반영합니다.
- API key는 `.env` 또는 RunPod secret으로만 관리합니다.
- RunPod에서는 코드 수정 대신 `git pull`로 동기화하는 방식을 권장합니다.
