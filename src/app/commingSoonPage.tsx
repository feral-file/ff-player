const ComingSoonPage = ({screenRatio} : {screenRatio: number}) => {
    return (
        <div style={{position: 'absolute', top: 0, backgroundColor: 'rgba(0, 0, 0, 0.80)', width: '100vw', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0 30%'}}>
            <div style={{width: '100%', height: 'fit-content', backgroundColor: '#2E2E2E', padding: screenRatio * 100, borderRadius: 20, textAlign: 'center'}}>
              <p style={{fontSize: screenRatio * 36}}>Coming soon...</p>
            </div>
        </div>
    );
}

export default ComingSoonPage;