let isRenewing = false;
let failedRequestList: Promise<any>[] = [];

function addFailedRequest(callback: any) {
  failedRequestList.push(callback);
}

function onRenewSucceed(accessToken: string) {
  // 리스트 내의 함수를 실행시켜 retryFailedRequest 를 resolve
  failedRequestList.forEach((callback: any) => callback(accessToken));
  failedRequestList = [];
}

function logout() {
  removeTokensLocal()
  // router.push('/auth/login')
}
function setTokensLocal({ accessToken, refreshToken }: { [v: string]: string }) {
  window.localStorage.setItem('accessToken', accessToken)
  window.localStorage.setItem('refreshToken', refreshToken)
}
function removeTokensLocal() {
  window.localStorage.removeItem('accessToken')
  window.localStorage.removeItem('refreshToken')
}

async function resetTokenAndReattemptRequest(error: AxiosError) {
  try {
    const { response } = error;

    // 매 호출 마다 실패한 요청을 callback 함수로 만들어 failedRequestList 에 추가
    // 매 호출 마다 retryFailedRequest 는 Promise<pending> 상태로 잔존
    // addFailedRequest 함수를 통해 새로운 토큰값을 사용할 수 있도록 명시하고, resolve 시 실패한 요청을 재수행
    // 요청이 실패한 경우는 reject 하여 실패한 요청 응답 반환
    const retryFailedRequest = new Promise((resolve, reject) => {
      addFailedRequest(
        async (accessToken: string) => {
          try {
            // 실패한 요청의 헤더값에 새로 받은 accessToken 을 할당하도록 함
            // @ts-ignore
            response.config.headers = {
              ...response?.config.headers,
              'Authorization': `Bearer ${accessToken}`
            }
            // @ts-ignore
            resolve(instance(response.config));
          } catch (error) {
            reject(error);
          }
        }
      );
    });

    // isRenewing 을 통해 한 번만 refresh 요청을 수행
    if (!isRenewing) {
      isRenewing = true;

      const token = window.localStorage.getItem('refreshToken') || ''
      const { accessToken, refreshToken } = await refreshTester(token)

      setTokensLocal({ accessToken, refreshToken })

      isRenewing = false;

      // failedRequestList 내의 콜백함수를 실행시켜 retryFailedRequest promise 를 resolve 시킴
      onRenewSucceed(accessToken);
    }

    // pending 됐다가 onRenewSucceed 호출될 때 resolve
    return retryFailedRequest;
  } catch (error) {
    // 실패하면 로그아웃
    logout()
    return Promise.reject(error);
  }
}

instance.interceptors.response.use(
  (response: AxiosResponse) => {
    console.log(`SUCCESS: [${response.config.url}] [${response.data.traceId}]`, response)

    return response
  },
  async (error: AxiosError<ApiResponse<unknown>>) => {
    // await handleError(error)

    if (error.response?.status === 401) {
      // 실패한 요청들이 재시도 되면서 받은 응답 결과를 반환
      return await resetTokenAndReattemptRequest(error)
    }

    return Promise.reject(error)
  }
)