import axios from 'axios';

const createBranchLink = async (data: any): Promise<string> => {
  const response = await axios.post('https://api2.branch.io/v1/url', {
    branch_key: process.env.NEXT_PUBLIC_BRANCH_KEY,
    data
  });

  return response.data.url;
};

export default createBranchLink;
